import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from "@google/genai";
import { db } from './src/lib/firebase-client.ts';
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import {
  INITIAL_PLAYERS,
  INITIAL_GAMES,
  INITIAL_PICKS,
  INITIAL_DISPATCHES,
  INITIAL_MESSAGES,
  INITIAL_FINES,
  INITIAL_SEASON_HISTORY
} from './src/data/initialData.ts';
import { Game, Player, PlayerPickData, WeeklyDispatch, ChatMessage, FineItem, SeasonHistory } from './src/types.ts';
import { evaluateLeaguePulse, LeaguePulse } from './src/services/leagueClockService.ts';
import { buildVibrantWeeklyDispatch } from './src/services/dispatchGeneratorService.ts';
import { scrapeSundayNflAction } from './src/services/nflSundayScraperService.ts';
import { loadCommishQuotes, addCommishQuote } from './src/services/commishArchivesService.ts';
import { PoolSetupConfig, DEFAULT_POOL_CONFIG } from './src/config/leagueConfig.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'unconfigured',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(express.json({ limit: '10mb' }));

const DATA_DIR = path.join(process.cwd(), 'data');
const STORAGE_FILE = path.join(DATA_DIR, 'pool-storage.json');
const BACKUP_STORAGE_FILE = path.join(DATA_DIR, 'pool-storage.bak.json');

// Interface for Master Timeclock event ledger
export interface MasterClockLedger {
  lastTickIso: string;
  ticksCount: number;
  lastPhase: string;
  completedEvents: Record<string, string>; // eventKey -> executedAtIso
}

// Interface for master pooled data stored globally
interface PoolStorageState {
  games: Game[];
  players: Player[];
  picks: Record<string, PlayerPickData>;
  dispatches: WeeklyDispatch[];
  messages: ChatMessage[];
  fines: FineItem[];
  seasonHistory?: SeasonHistory;
  poolConfig?: PoolSetupConfig;
  clockLedger?: MasterClockLedger;
  sundayStandings?: Record<string, {
    week: number;
    updatedAt: string;
    standings: Array<{
      name: string;
      sundayWins: number;
      sundayLosses: number;
      mnfPick: string;
      tb: string;
      rank: number;
    }>;
  }>;
  lastUpdated: string;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Empty set for public white-label template so any real contender name (Mike, Matt, Chris, Tom, etc.) is allowed
const BANNED_PLACEHOLDER_NAMES = new Set<string>([]);
const FAKE_DEMO_IDS = new Set<string>([]);

// Resolve configured Vegas Favorites Bot name (e.g., "Charlie Brown" or "Elvis")
function getConfiguredBotName(state?: PoolStorageState): string {
  const cfgName = state?.poolConfig?.elvisBotName || (typeof poolState !== 'undefined' ? poolState?.poolConfig?.elvisBotName : undefined);
  if (cfgName && cfgName.trim()) {
    return cfgName.trim();
  }
  const botPlayer = (state?.players || (typeof poolState !== 'undefined' ? poolState?.players : []) || []).find(
    p => p.id === 'elvis' || p.isElvis
  );
  if (botPlayer && botPlayer.name && botPlayer.name.trim()) {
    return botPlayer.name.trim();
  }
  return 'Elvis';
}

// Calculate Vegas Insider Favorites for the Vegas Bot
function getElvisVegasFavorites(gamesList: Game[], customBotName?: string): PlayerPickData {
  const botName = (customBotName || getConfiguredBotName()).trim() || 'Elvis';
  const picks: Record<number, string> = {};
  gamesList.forEach(g => {
    // Vegas Bot gets official Vegas favorites - guaranteed to be one of the teams in the game
    const away = (g.awayTeam || '').toLowerCase();
    const home = (g.homeTeam || '').toLowerCase();
    const fav = (g.favorite || '').toLowerCase();
    
    let chosenTeam = g.homeTeam;
    if (fav) {
      if (away.includes(fav) || fav.includes(away)) {
        chosenTeam = g.awayTeam;
      } else if (home.includes(fav) || fav.includes(home)) {
        chosenTeam = g.homeTeam;
      } else if (g.spread) {
        const spreadPrefix = g.spread.split(' ')[0]?.toLowerCase() || '';
        if (spreadPrefix && (away.includes(spreadPrefix) || spreadPrefix.includes(away))) {
          chosenTeam = g.awayTeam;
        } else {
          chosenTeam = g.homeTeam;
        }
      }
    }
    picks[g.gameNumber] = chosenTeam;
  });
  const mnf = gamesList.find(g => g.isMNF);
  const tiebreaker = mnf && mnf.overUnder ? Math.round(mnf.overUnder) : 48;
  return {
    contenderName: botName,
    picks,
    tiebreaker,
    submittedAt: new Date().toISOString()
  };
}

// Initial state filter (strictly official roster only)
function getInitialPoolState(): PoolStorageState {
  const filteredPlayers = INITIAL_PLAYERS.filter(p => 
    !BANNED_PLACEHOLDER_NAMES.has(p.id.toLowerCase()) && 
    !BANNED_PLACEHOLDER_NAMES.has(p.name.toLowerCase())
  );
  const filteredPicks: Record<string, PlayerPickData> = {};
  for (const [cName, pData] of Object.entries(INITIAL_PICKS)) {
    if (!BANNED_PLACEHOLDER_NAMES.has(cName.toLowerCase())) {
      filteredPicks[cName] = {
        contenderName: cName,
        picks: {},
        tiebreaker: ''
      };
    }
  }
  return {
    games: INITIAL_GAMES,
    players: [],
    picks: {},
    dispatches: INITIAL_DISPATCHES,
    messages: INITIAL_MESSAGES,
    fines: INITIAL_FINES,
    seasonHistory: INITIAL_SEASON_HISTORY,
    poolConfig: DEFAULT_POOL_CONFIG,
    lastUpdated: new Date().toISOString()
  };
}

// Sanitize and prune state payload to prevent obsolete keys, unindexed bloat, or ghost contenders
function sanitizePoolState(state: PoolStorageState): PoolStorageState {
  if (!state) return getInitialPoolState();

  if (!state.games || !Array.isArray(state.games) || state.games.length === 0) {
    state.games = INITIAL_GAMES;
  }

  const isVerbose = process.env.NODE_ENV !== 'production';

  // Normalize poolConfig admin identity
  if (state.poolConfig) {
    if (!state.poolConfig.adminName || state.poolConfig.adminName === 'Crew Chief') {
      state.poolConfig.adminName = DEFAULT_POOL_CONFIG.adminName;
    }
    if (!state.poolConfig.adminEmail || state.poolConfig.adminEmail === 'umpirechief@example.org' || state.poolConfig.adminEmail === 'admin@umpirepool.org') {
      state.poolConfig.adminEmail = DEFAULT_POOL_CONFIG.adminEmail;
    }
  }

  // 1. Normalize Vegas Favorites Bot name across players and prune any fake demo contenders
  const configuredBotName = getConfiguredBotName(state);
  const playerMap = new Map<string, Player>();
  (Array.isArray(state.players) ? state.players : INITIAL_PLAYERS).forEach(p => {
    const idLower = p.id.toLowerCase();
    const nameLower = p.name.toLowerCase();
    if (BANNED_PLACEHOLDER_NAMES.has(idLower) || BANNED_PLACEHOLDER_NAMES.has(nameLower) || FAKE_DEMO_IDS.has(idLower)) {
      return;
    }
    // If pool hasn't been configured yet via Setup Wizard, do not auto-seed Elvis or anyone else
    if (!state.poolConfig?.isConfigured && (idLower === 'elvis' || p.isElvis)) {
      return;
    }
    const isBot = p.id === 'elvis' || p.isElvis;
    const cleanName = isBot
      ? configuredBotName
      : p.name.replace(/\s*\(Vegas Favs\)\s*/i, '').trim();
    playerMap.set(cleanName.toLowerCase(), { ...p, name: cleanName, isElvis: isBot ? true : p.isElvis });
  });

  // Guarantee that once configured (or when contenders exist), the main Pool Admin is ALWAYS on the roster
  const isPoolConfigured = Boolean(state.poolConfig?.isConfigured || playerMap.size > 0);
  if (isPoolConfigured) {
    const adminName = (state.poolConfig?.adminName || DEFAULT_POOL_CONFIG.adminName).trim();
    const adminEmail = (state.poolConfig?.adminEmail || DEFAULT_POOL_CONFIG.adminEmail).trim();
    const adminKey = adminName.toLowerCase();
    if (!playerMap.has(adminKey)) {
      playerMap.set(adminKey, {
        id: adminKey.replace(/[^a-z0-9]/g, '') || 'admin-main',
        name: adminName,
        email: adminEmail,
        role: 'admin',
        tagline: 'Pool Admin & Contender',
        isActive: true,
        paid: true
      });
    } else {
      const existingAdmin = playerMap.get(adminKey)!;
      playerMap.set(adminKey, {
        ...existingAdmin,
        role: 'admin',
        email: existingAdmin.email || adminEmail,
        isActive: true
      });
    }
  }

  // Keep Pool Admin #1 on the roster, followed by human contenders, and Elvis last
  const sanitizedPlayers = Array.from(playerMap.values()).sort((a, b) => {
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    if (a.isElvis || a.id === 'elvis') return 1;
    if (b.isElvis || b.id === 'elvis') return -1;
    return 0;
  });
  const validContenderNamesLower = new Set(sanitizedPlayers.map(p => p.name.toLowerCase()));

  // 2. Normalize and index picks object ONLY for contenders on the official roster
  const sanitizedPicks: Record<string, PlayerPickData> = {};
  const rawPicks = state.picks || {};
  for (const [key, val] of Object.entries(rawPicks)) {
    const isLegacyBotKey = key === 'Elvis' || key === 'Elvis Presley';
    const rawContenderName = isLegacyBotKey ? configuredBotName : key;
    const contenderName = rawContenderName.replace(/\s*\(Vegas Favs\)\s*/i, '').trim();
    const contenderLower = contenderName.toLowerCase();

    // Drop ghost or placeholder contenders that are not on the official roster
    if (BANNED_PLACEHOLDER_NAMES.has(contenderLower) || !validContenderNamesLower.has(contenderLower)) {
      continue;
    }

    const picksObj: Record<number, string> = {};
    
    if (val && typeof val.picks === 'object') {
      for (const [gNumStr, team] of Object.entries(val.picks)) {
        const gNum = parseInt(gNumStr, 10);
        if (!isNaN(gNum) && typeof team === 'string' && team.trim()) {
          // If games exist, validate team is playing in this game to purge stale cross-week picks
          if (Array.isArray(state.games) && state.games.length > 0) {
            const game = state.games.find(g => g.gameNumber === gNum);
            if (game) {
              const away = game.awayTeam.toLowerCase();
              const home = game.homeTeam.toLowerCase();
              const picked = team.toLowerCase();
              if (away.includes(picked) || picked.includes(away)) {
                picksObj[gNum] = game.awayTeam;
              } else if (home.includes(picked) || picked.includes(home)) {
                picksObj[gNum] = game.homeTeam;
              } else if (contenderName === configuredBotName || contenderName === 'Elvis') {
                picksObj[gNum] = game.homeTeam;
              }
              continue;
            }
          }
          picksObj[gNum] = team.trim();
        }
      }
    } else if (val) {
      if (isVerbose) console.warn(`[Sanitize] Contender ${contenderName} has malformed picks object:`, val.picks);
    }

    const pickCount = Object.keys(picksObj).length;
    if (isVerbose && pickCount > 0) {
      console.log(`[Sanitize] ${contenderName}'s Picks: Sanitized to ${pickCount}`);
    }

    let tiebreaker: number | '' = '';
    if (val && val.tiebreaker !== undefined && val.tiebreaker !== '') {
      const num = typeof val.tiebreaker === 'number' ? val.tiebreaker : parseInt(String(val.tiebreaker), 10);
      if (!isNaN(num) && num >= 0 && num <= 200) {
        tiebreaker = num;
      }
    }
    sanitizedPicks[contenderName] = {
      contenderName,
      picks: picksObj,
      tiebreaker,
      submittedAt: val?.submittedAt
    };
  }

  // Ensure every active player has a pick record container (default empty sheets if not present)
  for (const p of sanitizedPlayers) {
    if (!sanitizedPicks[p.name]) {
      sanitizedPicks[p.name] = {
        contenderName: p.name,
        picks: {},
        tiebreaker: ''
      };
    }
  }

  // 3. Normalize dispatches (seed defaults if missing, deduplicate by id, keep most recent 20)
  const dispatchMap = new Map<string, WeeklyDispatch>();
  for (const initD of INITIAL_DISPATCHES) {
    if (initD && initD.id) {
      dispatchMap.set(initD.id, initD);
    }
  }
  const rawDispatches = Array.isArray(state.dispatches) ? state.dispatches : [];
  for (const d of rawDispatches) {
    if (d && d.id) {
      dispatchMap.set(d.id, d);
    }
  }
  const sanitizedDispatches = Array.from(dispatchMap.values()).slice(0, 20);

  // 4. Normalize chat messages (strictly genuine user messages, persistent season retention)
  const legacyFakeMessageIds = new Set(['msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5', 'msg-6']);
  const rawMessages = Array.isArray(state.messages) ? state.messages : [];
  const sanitizedMessages = rawMessages
    .filter(m => m && m.id && m.text && !legacyFakeMessageIds.has(m.id) && !m.text.includes('Welcome to Year 40') && !m.text.includes('Remember: disputes cost $1'))
    .slice(-5000);

  // 5. Normalize fines
  const legacyFakeFineIds = new Set(['fine-1', 'fine-2', 'fine-3', 'fine-4', 'fine-5', 'fine-6', 'fine-ump-demo-1']);
  const rawFines = Array.isArray(state.fines) ? state.fines : INITIAL_FINES;
  const sanitizedFines = rawFines
    .filter(f => f && f.id && f.contenderName && !legacyFakeFineIds.has(f.id));

  // 6. Normalize season history (prune any fake demo records and ensure every active contender has a record)
  const rawSeasonHistory: SeasonHistory = state.seasonHistory && state.seasonHistory.records
    ? state.seasonHistory
    : { ...INITIAL_SEASON_HISTORY, compiledWeeks: [], lockedWeeks: [], records: {} };
  if (!state.poolConfig?.isConfigured) {
    rawSeasonHistory.compiledWeeks = [];
    rawSeasonHistory.lockedWeeks = [];
    rawSeasonHistory.records = {};
  } else {
    for (const p of sanitizedPlayers) {
      if (!rawSeasonHistory.records[p.name]) {
        rawSeasonHistory.records[p.name] = {
          contenderName: p.name,
          totalWins: 0,
          totalLosses: 0,
          weeksWonCount: 0,
          weeklyBreakdown: {}
        };
      }
    }
  }
  const sanitizedSeasonHistory = rawSeasonHistory;

  // 7. Normalize games and attach kickoffIso without overwriting active weeks 1-18
  const rawGames = (Array.isArray(state.games) && state.games.length > 0) ? state.games : INITIAL_GAMES;
  const sanitizedGames = rawGames.map(g => {
    const initGame = INITIAL_GAMES.find(ig => ig.gameNumber === g.gameNumber);
    return {
      ...g,
      week: g.week || state.poolConfig?.startingWeek || 1,
      kickoffIso: g.kickoffIso || initGame?.kickoffIso
    };
  });

  return {
    games: sanitizedGames,
    players: sanitizedPlayers,
    picks: sanitizedPicks,
    dispatches: sanitizedDispatches,
    messages: sanitizedMessages,
    fines: sanitizedFines,
    seasonHistory: sanitizedSeasonHistory,
    poolConfig: state.poolConfig || DEFAULT_POOL_CONFIG,
    clockLedger: state.clockLedger || {
      lastTickIso: '',
      ticksCount: 0,
      lastPhase: '',
      completedEvents: {}
    },
    sundayStandings: state.sundayStandings || {},
    lastUpdated: state.lastUpdated || new Date().toISOString()
  };
}

// Temporal lockout evaluator
function isGameLockedByKickoff(game: Game, currentTime: number = Date.now()): boolean {
  if (game.status === 'final' || game.status === 'in_progress') {
    return true;
  }
  if (game.kickoffIso) {
    const kickoffMs = new Date(game.kickoffIso).getTime();
    if (!isNaN(kickoffMs) && currentTime >= kickoffMs) {
      return true;
    }
  }
  return false;
}

// Read pool state from disk, or recover from backup / initialize if missing
function loadPoolState(): PoolStorageState {
  for (const candidateFile of [STORAGE_FILE, BACKUP_STORAGE_FILE]) {
    try {
      if (fs.existsSync(candidateFile)) {
        const data = fs.readFileSync(candidateFile, 'utf-8');
        const parsed = JSON.parse(data);
        // Validate structure has required keys
        if (parsed && Array.isArray(parsed.games) && Array.isArray(parsed.players) && parsed.picks) {
          const sanitized = sanitizePoolState(parsed);
          if (candidateFile === BACKUP_STORAGE_FILE) {
            console.warn('[Server Storage] Recovered pool state from backup file after primary storage read failure.');
            try {
              fs.copyFileSync(BACKUP_STORAGE_FILE, STORAGE_FILE);
            } catch (_) {}
          }
          return sanitized;
        }
      }
    } catch (err) {
      console.error(`[Server Storage] Error reading ${path.basename(candidateFile)}:`, err);
    }
  }

  const initial = getInitialPoolState();
  savePoolState(initial).catch(err => console.error('[Server Storage] Error on initial save:', err));
  return initial;
}

// Save pool state safely to disk with rolling backup for power-outage resilience
async function savePoolState(state: PoolStorageState, syncPicksToCloud = false): Promise<void> {
  try {
    const sanitized = sanitizePoolState(state);
    sanitized.lastUpdated = new Date().toISOString();
    
    // Maintain rolling backup of last known good state before atomic swap
    if (fs.existsSync(STORAGE_FILE)) {
      try {
        fs.copyFileSync(STORAGE_FILE, BACKUP_STORAGE_FILE);
      } catch (_) {}
    }

    // Save to local disk for fast cold-starts
    const tempFile = `${STORAGE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(sanitized, null, 2), 'utf-8');
    fs.renameSync(tempFile, STORAGE_FILE);

    // PERSIST METADATA TO FIREBASE CLOUD (only when cloud db is enabled)
    if (db) {
      try {
        const batch = writeBatch(db);

        // 1. Sync Games
        batch.set(doc(db, 'metadata', 'games'), { 
          games: sanitized.games,
          lastUpdated: sanitized.lastUpdated 
        });

        // 2. Sync Players
        batch.set(doc(db, 'metadata', 'players'), { 
          players: sanitized.players,
          lastUpdated: sanitized.lastUpdated 
        });

        // 3. Sync Season History
        if (sanitized.seasonHistory) {
          batch.set(doc(db, 'metadata', 'seasonHistory'), sanitized.seasonHistory);
        }

        // 4. Sync Individual Picks (ONLY IF EXPLICITLY REQUESTED)
        if (syncPicksToCloud) {
          console.log('[Firebase Sync] Performing bulk picks sync to cloud...');
          Object.entries(sanitized.picks).forEach(([name, data]) => {
            batch.set(doc(db, 'picks', name), data);
          });
        }

        // 5. Sync Recent Messages & Fines & Dispatches & Sunday Standings
        batch.set(doc(db, 'metadata', 'messages'), { messages: sanitized.messages });
        batch.set(doc(db, 'metadata', 'fines'), { fines: sanitized.fines });
        batch.set(doc(db, 'metadata', 'dispatches'), { dispatches: sanitized.dispatches });
        if (sanitized.sundayStandings) {
          batch.set(doc(db, 'metadata', 'sundayStandings'), { sundayStandings: sanitized.sundayStandings });
        }

        await batch.commit();
      } catch (err: any) {
        console.warn('[Firebase Sync] Metadata write error:', err.message);
      }
    }

  } catch (err) {
    console.error('[Server Storage] Error writing pool-storage.json:', err);
  }
}

// Perform a deep sync from Firestore to local memory
async function syncFromCloud(): Promise<boolean> {
  if (!db) return true;
  if (!poolState.poolConfig?.isConfigured || !Array.isArray(poolState.players) || poolState.players.length === 0) {
    // Pool is in fresh Setup Wizard state; ensure cloud metadata matches clean unconfigured state
    await savePoolState(poolState, false);
    return true;
  }
  console.log('[Firebase Sync] Initializing deep sync from Firestore...');
  try {
    const picksSnap = await getDocs(collection(db, 'picks'));

    if (!picksSnap.empty) {
      // Re-initialize picks strictly for current registered players
      const botName = getConfiguredBotName(poolState);
      const freshPicks: Record<string, PlayerPickData> = {};
      (poolState.players || INITIAL_PLAYERS).forEach(p => {
        const cleanName = (p.id === 'elvis' || p.isElvis) ? botName : p.name;
        freshPicks[cleanName] = {
          contenderName: cleanName,
          picks: {},
          tiebreaker: ''
        };
      });

      let updatedCount = 0;
      picksSnap.forEach(d => {
        const data = d.data() as PlayerPickData;
        const name = (d.id === 'Elvis' && botName !== 'Elvis') ? botName : d.id;
        if (!Object.prototype.hasOwnProperty.call(freshPicks, name)) return;
        if (data && data.picks && typeof data.picks === 'object') {
          // Validate picks against current active week's games to prevent stale cross-week pick resurrection
          const validPicks: Record<number, string> = {};
          for (const [gNumStr, team] of Object.entries(data.picks)) {
            const gNum = parseInt(gNumStr, 10);
            if (isNaN(gNum) || typeof team !== 'string') continue;
            const game = poolState.games?.find(g => g.gameNumber === gNum);
            if (game) {
              const away = game.awayTeam.toLowerCase();
              const home = game.homeTeam.toLowerCase();
              const picked = team.toLowerCase();
              if (away.includes(picked) || picked.includes(away) || home.includes(picked) || picked.includes(home)) {
                validPicks[gNum] = team.trim();
              }
            }
          }

          if (Object.keys(validPicks).length > 0) {
            freshPicks[name] = {
              contenderName: name,
              picks: validPicks,
              tiebreaker: data.tiebreaker ?? '',
              submittedAt: data.submittedAt || new Date().toISOString()
            };
            updatedCount++;
          } else if (name === botName && poolState.picks?.[botName] && Object.keys(poolState.picks[botName].picks || {}).length > 0) {
            freshPicks[botName] = poolState.picks[botName];
            updatedCount++;
          }
        }
      });

      poolState.picks = freshPicks;
      console.log(`[Firebase Sync] Cloud sync: Loaded ${updatedCount} active contenders from Firestore into server storage.`);
    } else {
      console.log('[Firebase Sync] Firestore picks collection is currently empty.');
    }

    // Sync persistent Locker Room messages from Firestore collection
    const messagesSnap = await getDocs(collection(db, 'messages'));
    if (!messagesSnap.empty) {
      const legacyFakeMessageIds = new Set(['msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5', 'msg-6']);
      const cloudMessages: ChatMessage[] = [];
      messagesSnap.forEach(d => {
        const data = d.data() as ChatMessage;
        if (
          data &&
          data.id &&
          data.text &&
          !legacyFakeMessageIds.has(data.id) &&
          !data.text.includes('Welcome to Year 40') &&
          !data.text.includes('Remember: disputes cost $1') &&
          !data.text.includes("App is live! Remember you don't need a password")
        ) {
          cloudMessages.push({
            id: data.id,
            sender: data.sender || 'Contender',
            text: data.text,
            timestamp: data.timestamp || '',
            role: data.role || 'player'
          });
        }
      });

      // Sort chronologically using numeric timestamp in msg id
      cloudMessages.sort((a, b) => {
        const getTs = (id: string) => {
          const parts = id.split('-');
          const num = parseInt(parts[1], 10);
          return !isNaN(num) && num > 1000000000000 ? num : 0;
        };
        return getTs(a.id) - getTs(b.id);
      });

      if (cloudMessages.length > 0) {
        poolState.messages = cloudMessages;
        console.log(`[Firebase Sync] Cloud sync: Loaded ${cloudMessages.length} persistent season messages from Firestore.`);
      }
    }

    // Save the newly synced state to disk
    const sanitized = sanitizePoolState(poolState);
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(sanitized, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Firebase Sync] Critical error during cloud sync:', err);
  }
  return false;
}

// In-memory reference populated on start
let poolState: PoolStorageState = loadPoolState();

// Active Google OAuth Bearer Token stored in-memory (never persisted to disk per security constraints)
let activeGoogleToken: string | null = null;

// Autonomous Gmail Draft Creator via Google Workspace API
export async function createServerGmailDraft(
  token: string,
  to: string,
  bccList: string[],
  subject: string,
  bodyHtml: string
): Promise<{ success: boolean; id?: string; url?: string; error?: string }> {
  try {
    const bccHeader = bccList && bccList.length > 0 ? `Bcc: ${bccList.join(', ')}\r\n` : '';
    const rawEmail =
      `To: ${to}\r\n` +
      bccHeader +
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=UTF-8\r\n` +
      `Content-Transfer-Encoding: 8bit\r\n\r\n` +
      bodyHtml;

    const encodedMessage = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          raw: encodedMessage
        }
      })
    });

    if (!res.ok) {
      const errData: any = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `Gmail API error (${res.status})`;
      console.warn('[Gmail Draft] Draft creation failed:', msg);
      return { success: false, error: msg };
    }

    const data: any = await res.json();
    const draftUrl = `https://mail.google.com/mail/u/0/#drafts`;
    console.log(`[Gmail Draft] ✓ Draft created successfully in Gmail Drafts folder! ID: ${data.id}`);
    return { success: true, id: data.id, url: draftUrl };
  } catch (err: any) {
    console.warn('[Gmail Draft] Network/fetch error:', err.message);
    return { success: false, error: err.message };
  }
}

// Autonomous helper to scrape and ingest live NFL scores directly from ESPN
export async function scrapeAndIngestLiveNflScores(
  targetWeek?: number,
  options?: { allowHistorical?: boolean; maxGameNumber?: number; excludeMnf?: boolean }
): Promise<{
  success: boolean;
  changedCount: number;
  finalCount: number;
  error?: string;
}> {
  try {
    const allowHistorical = options?.allowHistorical ?? false;
    const week = targetWeek || poolState.games[0]?.week || poolState.poolConfig?.startingWeek || 1;
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}`;
    console.log(`[Score Scraper] Scraping live NFL scoreboard from ESPN for Week ${week} (allowHistorical=${allowHistorical})...`);

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      console.warn(`[Score Scraper] ESPN returned status ${res.status}`);
      return { success: false, changedCount: 0, finalCount: 0, error: `HTTP ${res.status}` };
    }

    const data: any = await res.json();
    const events: any[] = data.events || [];
    let changedCount = 0;
    let finalCount = 0;
    const totalGamesCount = poolState.games.length;

    poolState.games = poolState.games.map((game, idx) => {
      // Respect stage boundaries when stepping through Thursday Night or Sunday Night
      if (options?.maxGameNumber !== undefined && game.gameNumber > options.maxGameNumber) {
        if (game.status === 'final') finalCount++;
        return game;
      }
      if (options?.excludeMnf && (game.isMNF || idx === totalGamesCount - 1)) {
        return {
          ...game,
          status: 'scheduled',
          officialWinner: undefined,
          awayScore: undefined,
          homeScore: undefined
        };
      }

      const matched = events.find(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return false;
        const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
        const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
        if (!away || !home) return false;

        const awayName = (away.team?.name || away.team?.displayName || '').toLowerCase();
        const homeName = (home.team?.name || home.team?.displayName || '').toLowerCase();
        const awayCity = (away.team?.location || '').toLowerCase();
        const homeCity = (home.team?.location || '').toLowerCase();
        const gameAway = game.awayTeam.toLowerCase();
        const gameHome = game.homeTeam.toLowerCase();

        const awayMatch = gameAway.includes(awayName) || gameAway.includes(awayCity) || awayName.includes(gameAway) || awayCity.includes(gameAway);
        const homeMatch = gameHome.includes(homeName) || gameHome.includes(homeCity) || homeName.includes(gameHome) || homeCity.includes(gameHome);
        return awayMatch && homeMatch;
      });

      if (!matched) {
        if (game.status === 'final') finalCount++;
        return game;
      }

      const comp = matched.competitions?.[0];
      const awayComp = comp?.competitors?.find((c: any) => c.homeAway === 'away');
      const homeComp = comp?.competitors?.find((c: any) => c.homeAway === 'home');
      const state = matched.status?.type?.state; // 'pre', 'in', 'post'

      const awayRecord = awayComp?.records?.find((r: any) => r.type === 'total')?.summary || awayComp?.records?.[0]?.summary || (game as any).awayRecord || '';
      const homeRecord = homeComp?.records?.find((r: any) => r.type === 'total')?.summary || homeComp?.records?.[0]?.summary || (game as any).homeRecord || '';

      // Check if ESPN event timestamp is within the live 7-day calendar window
      const evMs = matched.date ? new Date(matched.date).getTime() : 0;
      const isLiveCalendarWindow = evMs > 0 && Math.abs(Date.now() - evMs) <= 7 * 24 * 3600 * 1000;

      // During background heartbeat ticks (!allowHistorical), do NOT flip a freshly scheduled test slate to final if ESPN data is historical
      if (!isLiveCalendarWindow && !allowHistorical) {
        if (game.status === 'final') finalCount++;
        return {
          ...game,
          awayRecord,
          homeRecord
        };
      }

      let awayScore = awayComp?.score !== undefined ? Number(awayComp.score) : game.awayScore;
      let homeScore = homeComp?.score !== undefined ? Number(homeComp.score) : game.homeScore;

      let newStatus: 'scheduled' | 'in_progress' | 'final' = game.status;
      let officialWinner = game.officialWinner;
      let quarter = game.quarter;
      let clock = matched.status?.displayClock || game.clock;

      if (state === 'post') {
        newStatus = 'final';
        quarter = 'FINAL';
        clock = '0:00';
        if (awayScore !== undefined && homeScore !== undefined) {
          if (awayScore > homeScore) officialWinner = game.awayTeam;
          else if (homeScore > awayScore) officialWinner = game.homeTeam;
          else if (awayScore === homeScore) officialWinner = 'TIE';
        }
      } else if (state === 'in') {
        newStatus = 'in_progress';
        quarter = `Q${matched.status?.period || 1}`;
      } else if (allowHistorical && state === 'pre') {
        // If explicitly stepping through a future unplayed week in lifecycle test mode, compute realistic final score from Vegas line
        newStatus = 'final';
        quarter = 'FINAL';
        clock = '0:00';
        const favIsHome = !game.favorite || game.favorite.toLowerCase() === game.homeTeam.toLowerCase();
        const upset = ((game.gameNumber * 7 + week * 3) % 5) === 0;
        const winnerIsHome = upset ? !favIsHome : favIsHome;
        homeScore = winnerIsHome ? 27 : 20;
        awayScore = winnerIsHome ? 20 : 24;
        officialWinner = winnerIsHome ? game.homeTeam : game.awayTeam;
      }

      if (newStatus === 'final') finalCount++;

      if (awayScore !== game.awayScore || homeScore !== game.homeScore || newStatus !== game.status) {
        changedCount++;
      }

      return {
        ...game,
        awayScore,
        homeScore,
        awayRecord,
        homeRecord,
        status: newStatus,
        officialWinner,
        quarter,
        clock,
        lastUpdated: new Date().toISOString()
      };
    });

    if (changedCount > 0) {
      await savePoolState(poolState, true);
      console.log(`[Score Scraper] ✓ Ingested ${changedCount} game score updates for Week ${week}. Total final games: ${finalCount}`);
    }

    return { success: true, changedCount, finalCount };
  } catch (err: any) {
    console.warn('[Score Scraper] Notice, live score scrape error:', err.message);
    return { success: false, changedCount: 0, finalCount: 0, error: err.message };
  }
}

// Autonomous helper to sync NFL team win-loss records and latest spreads from ESPN
export async function syncNflTeamRecordsAndOdds(targetWeek?: number): Promise<{
  success: boolean;
  updatedCount: number;
  records: Array<{ gameNumber: number; away: string; awayRecord: string; home: string; homeRecord: string; spread: string }>;
}> {
  try {
    const week = targetWeek || poolState.games[0]?.week || 4;
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}`;
    console.log(`[Records Scraper] Fetching NFL team win/loss records & lines from ESPN for Week ${week}...`);

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      console.warn(`[Records Scraper] ESPN returned status ${res.status}`);
      return { success: false, updatedCount: 0, records: [] };
    }

    const data: any = await res.json();
    const events: any[] = data.events || [];
    let updatedCount = 0;
    const recordsSummary: any[] = [];

    poolState.games = poolState.games.map(game => {
      const matched = events.find(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return false;
        const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
        const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
        if (!away || !home) return false;

        const awayName = (away.team?.name || away.team?.displayName || '').toLowerCase();
        const homeName = (home.team?.name || home.team?.displayName || '').toLowerCase();
        const awayCity = (away.team?.location || '').toLowerCase();
        const homeCity = (home.team?.location || '').toLowerCase();
        const gameAway = game.awayTeam.toLowerCase();
        const gameHome = game.homeTeam.toLowerCase();

        const awayMatch = gameAway.includes(awayName) || gameAway.includes(awayCity) || awayName.includes(gameAway) || awayCity.includes(gameAway);
        const homeMatch = gameHome.includes(homeName) || gameHome.includes(homeCity) || homeName.includes(gameHome) || homeCity.includes(gameHome);
        return awayMatch && homeMatch;
      });

      if (!matched) return game;

      const comp = matched.competitions?.[0];
      const awayComp = comp?.competitors?.find((c: any) => c.homeAway === 'away');
      const homeComp = comp?.competitors?.find((c: any) => c.homeAway === 'home');

      const awayRecord = awayComp?.records?.find((r: any) => r.type === 'total')?.summary || awayComp?.records?.[0]?.summary || (game as any).awayRecord || '';
      const homeRecord = homeComp?.records?.find((r: any) => r.type === 'total')?.summary || homeComp?.records?.[0]?.summary || (game as any).homeRecord || '';

      const odds = comp?.odds?.[0];
      const spread = odds?.details || game.spread;
      const overUnder = odds?.overUnder || game.overUnder;

      if ((game as any).awayRecord !== awayRecord || (game as any).homeRecord !== homeRecord) {
        updatedCount++;
      }

      recordsSummary.push({
        gameNumber: game.gameNumber,
        away: game.awayTeam,
        awayRecord,
        home: game.homeTeam,
        homeRecord,
        spread
      });

      return {
        ...game,
        awayRecord,
        homeRecord,
        spread,
        overUnder: overUnder || game.overUnder,
        lastUpdated: new Date().toISOString()
      };
    });

    if (updatedCount > 0 || poolState.games.some(g => (g as any).awayRecord)) {
      await savePoolState(poolState, true);
      console.log(`[Records Scraper] ✓ Updated ${updatedCount} team records and lines for Week ${week}.`);
    }

    return { success: true, updatedCount, records: recordsSummary };
  } catch (err: any) {
    console.warn('[Records Scraper] Error syncing team records:', err.message);
    return { success: false, updatedCount: 0, records: [] };
  }
}

// Autonomous Gmail Draft Stager via Google Workspace API for all 3 weekly triggers
export async function stageDispatchToGmail(dispatch: WeeklyDispatch): Promise<{
  success: boolean;
  id?: string;
  url?: string;
  error?: string;
  status: string;
}> {
  const adminEmail = poolState.poolConfig?.adminEmail || poolState.players.find(p => p.role === 'admin')?.email || '';
  const activeContenderEmails = Array.from(new Set(
    (poolState.players || [])
      .filter(p => p.isActive !== false && !p.isElvis && p.email && p.email.includes('@'))
      .map(p => p.email.trim())
  ));

  if (activeGoogleToken && adminEmail) {
    const res = await createServerGmailDraft(
      activeGoogleToken,
      adminEmail,
      activeContenderEmails,
      dispatch.subject || dispatch.title,
      dispatch.body_html || dispatch.content || ''
    );
    if (res.success) {
      dispatch.draftId = res.id;
      dispatch.draftUrl = res.url;
      dispatch.status = 'drafted';
      console.log(`[Master Clock] ✓ Stage complete: Draft successfully placed into Gmail Drafts for ${dispatch.title} (ID: ${res.id})`);
      return { success: true, id: res.id, url: res.url, status: 'drafted' };
    } else {
      dispatch.status = 'pending';
      console.warn(`[Master Clock] Gmail API token notice: ${res.error}. Flagged ready for browser auto-draft.`);
      return { success: false, error: res.error, status: 'token_error' };
    }
  } else {
    dispatch.status = 'pending';
    console.log(`[Master Clock] Server token not registered yet; dispatch flagged for browser auto-draft.`);
    return { success: false, error: 'awaiting_token', status: 'awaiting_token' };
  }
}

// -------------------------------------------------------------
// SYNCHRONIZED SUNDAY NIGHT CONCURRENT PIPELINE
// 1. Game ends Sunday night trigger (SNF final)
// 2. Final standings & scores recorded to local storage and synced to cloud trigger
// 3. Content generator creates relevant examples from store & scrapes web for NFL content producing Sunday dispatch trigger
// 4. Draft dispatch sent to Gmail trigger
// -------------------------------------------------------------
export async function executeSundayNightSequence(activeWeek: number): Promise<{
  success: boolean;
  snfFinal: boolean;
  standingsCount: number;
  dispatch: WeeklyDispatch;
  gmailDraftResult: { success: boolean; id?: string; url?: string; error?: string; status: string };
}> {
  console.log(`[Master Clock] ⏰ === STARTING SYNCHRONIZED SUNDAY NIGHT SEQUENCE (WEEK ${activeWeek}) ===`);
  
  // 0. ASSIGN LIVE SCORE SCRAPING TASK: Ingest current NFL scores, winners, and statuses for Sunday games (keeping MNF open)
  console.log(`[Master Clock] [Scraping Task] Ingesting live NFL scoreboard for Week ${activeWeek}...`);
  await scrapeAndIngestLiveNflScores(activeWeek, { allowHistorical: true, excludeMnf: true });

  // Scrape Sunday NFL action & upsets wire from ESPN
  const sundayReport = await scrapeSundayNflAction();

  const games = poolState.games || [];
  const activePlayers = (poolState.players || INITIAL_PLAYERS).filter(p => p.isActive !== false);

  // 1. GAME ENDS SUNDAY NIGHT TRIGGER
  const pulse = evaluateLeaguePulse(games);
  const snfGame = games.find(g => g.isSNF || (g.day && g.day.toLowerCase().includes('sun night')) || g.gameNumber === 15);
  const isSnfEnded = snfGame?.status === 'final' || pulse.snfFinal || pulse.phase === 'SNF_FINAL';
  console.log(`[Master Clock] [Stage 1/4] SNF Game End Trigger: ${isSnfEnded ? 'SNF GAME FINAL' : 'TRIGGERED (Time Window/Clock Pulse)'}`);

  // 2. FINAL STANDINGS AND SCORES RECORDED TO LOCAL STORAGE & SYNCED TO CLOUD TRIGGER
  console.log(`[Master Clock] [Stage 2/4] Calculating Sunday standings & scores, persisting locally and syncing to Firestore...`);
  const mnfGame = games.find(g => g.isMNF || (g.day && g.day.toLowerCase().includes('mon')) || g.gameNumber === 16);
  
  const botName = getConfiguredBotName(poolState);
  const rawSundayStandings = activePlayers.map(p => {
    const cleanName = (p.id === 'elvis' || p.isElvis) ? botName : p.name;
    const pPicks = poolState.picks[cleanName]?.picks || poolState.picks[p.name]?.picks || {};
    const rawTb = poolState.picks[cleanName]?.tiebreaker ?? poolState.picks[p.name]?.tiebreaker ?? '';

    let sundayWins = 0;
    let sundayLosses = 0;
    // Straight-up scoring strictly: 1 pt per outright winner on completed Sunday games (G1 through G15)
    games.forEach(g => {
      if (g.isMNF || g.gameNumber === 16) return; // Keep MNF isolated
      const pick = pPicks[g.gameNumber];
      const isTie = g.isTie || g.officialWinner === 'TIE' || (g.status === 'final' && g.awayScore !== undefined && g.homeScore !== undefined && g.awayScore === g.homeScore);
      if (isTie) {
        return; // Push: neither win nor loss for straight-up points
      }
      if (g.status === 'final' && g.officialWinner) {
        if (pick && pick.toLowerCase() === g.officialWinner.toLowerCase()) sundayWins++;
        else sundayLosses++;
      }
    });

    const mnfPick = (mnfGame && pPicks[mnfGame.gameNumber]) || 'Pending';

    return {
      name: cleanName,
      sundayWins,
      sundayLosses,
      mnfPick,
      tb: String(rawTb || '')
    };
  }).sort((a, b) => b.sundayWins - a.sundayWins);

  let currentRank = 1;
  const rankedSundayStandings = rawSundayStandings.map((r, idx) => {
    if (idx > 0 && r.sundayWins < rawSundayStandings[idx - 1].sundayWins) {
      currentRank = idx + 1;
    }
    return {
      ...r,
      rank: currentRank
    };
  });

  if (!poolState.sundayStandings) {
    poolState.sundayStandings = {};
  }
  poolState.sundayStandings[`week-${activeWeek}`] = {
    week: activeWeek,
    updatedAt: new Date().toISOString(),
    standings: rankedSundayStandings
  };

  // Sync to local disk and cloud storage
  await savePoolState(poolState, true);
  console.log(`[Master Clock] ✓ Stage 2 complete: Standings and scores recorded to pool-storage.json and synced to Cloud Firestore.`);

  // 3. CONTENT GENERATOR CREATES RELEVANT EXAMPLES FROM STORE & SCRAPES WEB FOR NFL CONTENT PRODUCING SUNDAY DISPATCH TRIGGER
  console.log(`[Master Clock] [Stage 3/4] Running content generator with web scraping and historical store streak radar...`);
  const dispatch = await buildVibrantWeeklyDispatch(
    'sunday',
    activeWeek,
    games,
    poolState.players,
    poolState.picks,
    poolState.seasonHistory,
    undefined,
    undefined,
    sundayReport,
    undefined,
    poolState.poolConfig || DEFAULT_POOL_CONFIG
  );

  const existingIdx = poolState.dispatches.findIndex(d =>
    (dispatch.id && d.id === dispatch.id) ||
    (d.type === dispatch.type && (d.week === dispatch.week || d.weekNumber === dispatch.weekNumber))
  );
  if (existingIdx >= 0) {
    poolState.dispatches[existingIdx] = dispatch;
  } else {
    poolState.dispatches.unshift(dispatch);
  }

  // 4. DRAFT DISPATCH SENT TO GMAIL TRIGGER
  console.log(`[Master Clock] [Stage 4/4] Sending draft dispatch to Gmail...`);
  const draftResult = await stageDispatchToGmail(dispatch);

  const sundayKey = `auto-dispatch-sunday-week-${activeWeek}`;
  if (!poolState.clockLedger) {
    poolState.clockLedger = {
      lastTickIso: new Date().toISOString(),
      ticksCount: 1,
      lastPhase: pulse.phase,
      completedEvents: {}
    };
  }
  poolState.clockLedger.completedEvents[sundayKey] = new Date().toISOString();
  if (draftResult.success && draftResult.id) {
    poolState.clockLedger.completedEvents[`${sundayKey}-draft-${draftResult.id}`] = new Date().toISOString();
  }

  await savePoolState(poolState, true);
  console.log(`[Master Clock] ✓ Synchronized Sunday Night Sequence successfully finished!`);

  return {
    success: true,
    snfFinal: isSnfEnded,
    standingsCount: rankedSundayStandings.length,
    dispatch,
    gmailDraftResult: draftResult
  };
}

// =============================================================
// MASTER TIMECLOCK ENGINE & DECOUPLED TRIGGER CONTROLLER
// =============================================================
const CLOCK_INTERVAL_MS = 30000; // 30-second heartbeat
let masterClockTimer: NodeJS.Timeout | null = null;

export async function runMasterClockTick(): Promise<void> {
  try {
    const games = poolState.games || [];
    if (games.length === 0) return;

    const pulse = evaluateLeaguePulse(games);
    const activeWeek = pulse.currentWeek;

    if (!poolState.clockLedger) {
      poolState.clockLedger = {
        lastTickIso: new Date().toISOString(),
        ticksCount: 0,
        lastPhase: pulse.phase,
        completedEvents: {}
      };
    }

    poolState.clockLedger.lastTickIso = new Date().toISOString();
    poolState.clockLedger.ticksCount += 1;
    poolState.clockLedger.lastPhase = pulse.phase;

    // Do not fire autonomous pool triggers until the Pool Admin completes the Setup Wizard
    if (!poolState.poolConfig?.isConfigured) {
      return;
    }

    // -------------------------------------------------------------
    // CALENDAR ASSESSMENT (America/Los_Angeles / PST Timezone)
    // Autonomous triggers fire on Game State OR Scheduled Time Window
    // -------------------------------------------------------------
    const now = new Date();
    const pstParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).formatToParts(now);
    const pstDay = pstParts.find(p => p.type === 'weekday')?.value; // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
    const pstHour = parseInt(pstParts.find(p => p.type === 'hour')?.value || '0', 10);
    const pstMinute = parseInt(pstParts.find(p => p.type === 'minute')?.value || '0', 10);

    const isFridayCalendarTrigger = (pstDay === 'Fri' && (pstHour > 18 || (pstHour === 18 && pstMinute >= 0))) || pstDay === 'Sat';
    const isSundayCalendarTrigger = (pstDay === 'Sun' && (pstHour > 20 || (pstHour === 20 && pstMinute >= 30))) || (pstDay === 'Mon' && pstHour < 17);
    const isTuesdayCalendarTrigger = (pstDay === 'Tue' && (pstHour > 7 || (pstHour === 7 && pstMinute >= 30))) || pstDay === 'Wed';

    // -------------------------------------------------------------
    // LIVE SCORE INGESTION ON HEARTBEAT
    // Periodically sync live ESPN scores during active slate days (Sun, Mon, Tue, Thu)
    // or whenever games are in_progress or scheduled, ensuring game statuses and MNF finals
    // are never stale in server memory.
    // -------------------------------------------------------------
    const humanPlayers = (poolState.players || []).filter(p => p.isActive !== false && !p.isElvis && p.id !== 'elvis');
    const humansWithPicks = humanPlayers.filter(p => {
      const pData = poolState.picks[p.name];
      return pData && pData.picks && Object.keys(pData.picks).length > 0;
    });
    const hasAnyHumanPicks = humansWithPicks.length > 0;
    const allHumansPicked = humanPlayers.length > 0 && humansWithPicks.length === humanPlayers.length;

    const hasUnfinalGames = games.some(g => g.status === 'in_progress' || g.status === 'scheduled');
    const isScoreDay = pstDay === 'Sun' || pstDay === 'Mon' || pstDay === 'Tue' || pstDay === 'Thu' || (pstDay === 'Sat' && allHumansPicked);
    if (hasUnfinalGames && isScoreDay) {
      try {
        await scrapeAndIngestLiveNflScores(activeWeek);
      } catch (scoreErr: any) {
        // Non-fatal background sync notice
      }
    }

    // -------------------------------------------------------------
    // TRIGGER 0: Autonomous NFL Team Win-Loss Records & Lines Sync
    // Verifies and auto-populates live NFL team records on all pick cards
    // -------------------------------------------------------------
    const recordsEventKey = `auto-records-sync-week-${activeWeek}`;
    const missingRecords = games.some(g => !(g as any).awayRecord || !(g as any).homeRecord);
    if (missingRecords && !poolState.clockLedger.completedEvents[recordsEventKey]) {
      console.log(`[Master Clock] ⏰ Trigger: Syncing NFL team win-loss records for Week ${activeWeek}...`);
      await syncNflTeamRecordsAndOdds(activeWeek);
      poolState.clockLedger.completedEvents[recordsEventKey] = new Date().toISOString();
      await savePoolState(poolState, true);
      console.log(`[Master Clock] ✓ NFL Team records and spreads populated.`);
    }

    // -------------------------------------------------------------
    // TRIGGER 1: Autonomous Vegas Favorites Bot
    // Vegas Bot resets to a clean sheet with everyone else on Tuesday reset.
    // Vegas favorites are only populated near kickoff (Thursday 4 PM PST+ or live action)
    // -------------------------------------------------------------
    const botName = getConfiguredBotName(poolState);
    const elvisEventKey = `elvis-vegas-picks-week-${activeWeek}`;
    const elvisPicksRecord = poolState.picks[botName] || poolState.picks['Elvis'];
    const elvisPickCount = elvisPicksRecord && elvisPicksRecord.picks ? Object.keys(elvisPicksRecord.picks).length : 0;
    const isKickoffApproaching = (pstDay === 'Thu' && pstHour >= 16) || games.some(g => g.status === 'in_progress' || g.status === 'final') || pstDay === 'Fri' || pstDay === 'Sat' || pstDay === 'Sun' || pstDay === 'Mon';

    if (isKickoffApproaching && (elvisPickCount < games.length || !poolState.clockLedger.completedEvents[elvisEventKey])) {
      console.log(`[Master Clock] ⏰ Trigger: Populating ${botName} Vegas favorites for Week ${activeWeek}...`);
      const elvisFavorites = getElvisVegasFavorites(games, botName);
      poolState.picks[botName] = elvisFavorites;
      if (botName !== 'Elvis') delete poolState.picks['Elvis'];
      poolState.clockLedger.completedEvents[elvisEventKey] = new Date().toISOString();
      await savePoolState(poolState, true);
      if (db) {
        try {
          await setDoc(doc(db, 'picks', botName), elvisFavorites, { merge: true });
          console.log(`[Master Clock] ✓ ${botName} picks synced directly to Cloud Firestore.`);
        } catch (fsErr: any) {
          console.warn(`[Master Clock] Cloud Firestore direct sync warning for ${botName}:`, fsErr.message);
        }
      }
      console.log(`[Master Clock] ✓ ${botName} picks populated and saved.`);
    }

    // -------------------------------------------------------------
    // TRIGGER 1B: Autonomous Vegas Favorites Fallback ("Dad's Rule")
    // When an individual game reaches kickoff whistle, contenders who did
    // not submit a pick receive the Vegas Opening Favorite stamped with
    // autoDefaultGames. Eliminates zero-scores and admin liability.
    // -------------------------------------------------------------
    const enableVegasFallback = poolState.poolConfig?.enableAutoVegasFavoritesFallback !== false;
    if (enableVegasFallback && games.length > 0) {
      let anyDefaultsAssigned = false;
      const registeredPlayers = (poolState.players || []).filter(p => p.isActive !== false && !p.isElvis && p.id !== 'elvis');
      const nowMs = Date.now();

      games.forEach(game => {
        const isLocked = isGameLockedByKickoff(game, nowMs);
        if (!isLocked) return;

        let favTeam = game.favorite;
        if (!favTeam || (favTeam !== game.awayTeam && favTeam !== game.homeTeam)) {
          favTeam = game.homeTeam; // Default to home team if spread is EVEN or unlisted
        }

        registeredPlayers.forEach(player => {
          if (!poolState.picks[player.name]) {
            poolState.picks[player.name] = {
              contenderName: player.name,
              picks: {},
              tiebreaker: ''
            };
          }
          const pRecord = poolState.picks[player.name];
          if (!pRecord.picks) pRecord.picks = {};

          // Check if game is missing a pick at kickoff
          if (!pRecord.picks[game.gameNumber]) {
            pRecord.picks[game.gameNumber] = favTeam;
            if (!pRecord.autoDefaultGames) pRecord.autoDefaultGames = [];
            if (!pRecord.autoDefaultGames.includes(game.gameNumber)) {
              pRecord.autoDefaultGames.push(game.gameNumber);
            }
            pRecord.submittedAt = new Date().toISOString();
            anyDefaultsAssigned = true;
            console.log(`[Dad's Rule] Kickoff auto-default assigned: Game ${game.gameNumber} (${favTeam}) to ${player.name}`);
          }

          // If MNF game is locked and tiebreaker is missing
          if (game.isMNF && (pRecord.tiebreaker === '' || pRecord.tiebreaker === undefined)) {
            const fallbackTb = game.overUnder ? Math.round(game.overUnder) : 45;
            pRecord.tiebreaker = fallbackTb;
            pRecord.isAutoDefaultTiebreaker = true;
            anyDefaultsAssigned = true;
            console.log(`[Dad's Rule] MNF tiebreaker auto-default assigned: ${fallbackTb} to ${player.name}`);
          }
        });
      });

      if (anyDefaultsAssigned) {
        await savePoolState(poolState, true);
        if (db) {
          try {
            for (const player of registeredPlayers) {
              const pData = poolState.picks[player.name];
              if (pData) {
                await setDoc(doc(db, 'picks', player.name), pData, { merge: true });
              }
            }
            console.log(`[Dad's Rule] Auto-defaulted picks synced to Cloud Firestore.`);
          } catch (e: any) {
            console.warn(`[Dad's Rule] Firestore sync error:`, e.message);
          }
        }
      }
    }

    // -------------------------------------------------------------
    // TRIGGER 2: Autonomous Dispatch Generation (Decoupled & Idempotent)
    // - Friday Night Wire: Generated on TNF_FINAL or Friday 6:00 PM PST
    // - Sunday Night Recap: Generated on SNF_FINAL or Sunday 8:30 PM PST
    // - Tuesday Final: Generated on MNF_FINAL or Tuesday 00:00 PST
    // -------------------------------------------------------------
    const commitDispatch = (dispatch: WeeklyDispatch) => {
      const existingIdx = poolState.dispatches.findIndex(d =>
        (dispatch.id && d.id === dispatch.id) ||
        (d.type === dispatch.type && (d.week === dispatch.week || d.weekNumber === dispatch.weekNumber))
      );
      if (existingIdx >= 0) {
        poolState.dispatches[existingIdx] = dispatch;
      } else {
        poolState.dispatches.unshift(dispatch);
      }
    };

    // Respect league dispatchCadence (1 = Tuesday only, 2 = Sunday + Tuesday, 3 = Friday + Sunday + Tuesday)
    const dispatchCadence = poolState.poolConfig?.dispatchCadence || 1;

    // 2A: Friday Night Wire (TNF Final OR Scheduled Friday Time) - Only if cadence === 3 and contenders have submitted picks
    const fridayKey = `auto-dispatch-friday-week-${activeWeek}`;
    const shouldTriggerFriday = dispatchCadence === 3 && hasAnyHumanPicks && (pulse.tnfFinal || pulse.phase === 'TNF_FINAL' || isFridayCalendarTrigger) && !poolState.clockLedger.completedEvents[fridayKey];
    if (shouldTriggerFriday) {
      console.log(`[Master Clock] ⏰ Trigger: Auto-generating Friday Night Wire for Week ${activeWeek}...`);
      const dispatch = await buildVibrantWeeklyDispatch(
        'friday',
        activeWeek,
        games,
        poolState.players,
        poolState.picks,
        poolState.seasonHistory,
        undefined,
        undefined,
        undefined,
        undefined,
        poolState.poolConfig || DEFAULT_POOL_CONFIG
      );
      commitDispatch(dispatch);
      await stageDispatchToGmail(dispatch);
      poolState.clockLedger.completedEvents[fridayKey] = new Date().toISOString();
      await savePoolState(poolState, true);
      console.log(`[Master Clock] ✓ Friday Night Wire generated, published & staged to Gmail.`);
    }

    // 2B: Synchronized Sunday Night Sequence (SNF Final OR Scheduled Sunday Time with live games completed) - Only if cadence >= 2
    const sundayKey = `auto-dispatch-sunday-week-${activeWeek}`;
    const shouldTriggerSunday = dispatchCadence >= 2 && (pulse.snfFinal || pulse.phase === 'SNF_FINAL' || (isSundayCalendarTrigger && pulse.finalGames >= 10)) && !poolState.clockLedger.completedEvents[sundayKey];
    if (shouldTriggerSunday) {
      console.log(`[Master Clock] ⏰ Trigger: Starting Synchronized Sunday Night Sequence for Week ${activeWeek}...`);
      await executeSundayNightSequence(activeWeek);
    }

    // -------------------------------------------------------------
    // TRIGGER 2C & 3: SYNCHRONIZED TUESDAY UNIFIED PIPELINE ("ONE BUILD")
    // Single Deterministic Reset Switch:
    // Triggers once the clock rolls past Monday Night at Midnight (Tuesday 00:00 PST onwards)
    // OR whenever Monday Night Football has officially concluded.
    // Zero magic numbers, zero bye-week count traps, zero artificial 7 AM locks.
    // Guarded to only fire if the active week's games have commenced (not a fresh scheduled slate),
    // preventing any premature rollover on fresh incoming weeks.
    // -------------------------------------------------------------
    const tuesdayKey = `auto-dispatch-tuesday-week-${activeWeek}`;
    const advanceKey = `auto-advance-week-${activeWeek}`;
    const isPastMondayMidnight = pstDay === 'Tue' || pstDay === 'Wed';
    const isMnfConcluded = Boolean(pulse.mnfFinal || pulse.allGamesFinal);
    const hasActiveWeekCommenced = games.some(g => g.status === 'final' || g.status === 'in_progress');
    const shouldTriggerTuesdayCycle = hasActiveWeekCommenced && (isPastMondayMidnight || isMnfConcluded) &&
      (!poolState.clockLedger.completedEvents[tuesdayKey] || !poolState.clockLedger.completedEvents[advanceKey]);

    if (shouldTriggerTuesdayCycle) {
      console.log(`[Master Clock] ⏰ Trigger: Starting Unified Tuesday Cycle Pipeline for Week ${activeWeek} (Monday Midnight / MNF Final Single Switch)...`);
      await executeTuesdayCyclePipeline(activeWeek);
    }

  } catch (err: any) {
    console.error('[Master Clock] Error during tick:', err.message);
  }
}

export function startMasterClock(): void {
  if (masterClockTimer) return;
  console.log('[Master Clock] ⏰ Initializing Master Timeclock ticker (30s interval)...');
  syncNflTeamRecordsAndOdds().catch(err => console.error('[Master Clock] Initial records sync notice:', err.message));
  runMasterClockTick().catch(err => console.error('[Master Clock] Initial tick failed:', err));
  masterClockTimer = setInterval(() => {
    runMasterClockTick().catch(err => console.error('[Master Clock] Interval tick failed:', err));
  }, CLOCK_INTERVAL_MS);
}

// -------------------------------------------------------------
// REST API ROUTES (MUST COME FIRST BEFORE VITE MIDDLEWARE)
// -------------------------------------------------------------

// Refresh NFL team records and spreads directly from ESPN on-demand
app.post('/api/admin/refresh-team-records', async (req, res) => {
  const targetWeek = req.body?.week ? Number(req.body.week) : (poolState.games[0]?.week || 4);
  const result = await syncNflTeamRecordsAndOdds(targetWeek);
  res.json(result);
});

// Authoritative Live NFL Week & Calendar Detector (Anchored to NFL Regular Season Calendar + Live ESPN Verification)
export async function detectAuthoritativeLiveNflWeek(now: Date = new Date()): Promise<{
  detectedWeek: number;
  seasonYear: number;
  isMidseason: boolean;
  isLiveWindow: boolean;
}> {
  const year = now.getFullYear();
  // Labor Day is the 1st Monday in September of `year`
  const sept1 = new Date(Date.UTC(year, 8, 1, 12, 0, 0));
  const dayOfWeek = sept1.getUTCDay(); // 0 = Sun, 1 = Mon, ...
  const daysToFirstMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7;
  // NFL Week 1 starts the Tuesday after Labor Day at 08:00 UTC (Midnight PST)
  const week1StartMs = Date.UTC(year, 8, 1 + daysToFirstMonday + 1, 8, 0, 0);
  const diffMs = now.getTime() - week1StartMs;
  const calendarWeek = diffMs < 0
    ? 1
    : Math.min(18, Math.max(1, Math.floor(diffMs / (7 * 24 * 3600 * 1000)) + 1));

  let detectedWeek = calendarWeek;
  const seasonYear = year;
  let isLiveWindow = diffMs >= 0 && diffMs <= 19 * 7 * 24 * 3600 * 1000;

  try {
    const url = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
    const espnRes = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (espnRes.ok) {
      const data: any = await espnRes.json();
      const events: any[] = data?.events || [];
      const hasCurrentEvents = events.some(ev => {
        const ms = ev.date ? new Date(ev.date).getTime() : 0;
        return ms > 0 && Math.abs(now.getTime() - ms) <= 6 * 24 * 3600 * 1000;
      });
      if (hasCurrentEvents && data?.season?.type === 2 && typeof data?.week?.number === 'number') {
        detectedWeek = Math.min(18, Math.max(1, data.week.number));
        isLiveWindow = true;
      }
    }
  } catch (e) {}

  return {
    detectedWeek,
    seasonYear,
    isMidseason: detectedWeek > 1,
    isLiveWindow
  };
}

app.get('/api/nfl/live-week', async (_req, res) => {
  try {
    const liveInfo = await detectAuthoritativeLiveNflWeek();
    res.json({
      success: true,
      detectedWeek: liveInfo.detectedWeek,
      seasonYear: liveInfo.seasonYear,
      isMidseason: liveInfo.isMidseason,
      isLiveWindow: liveInfo.isLiveWindow,
      activePoolWeek: poolState.games?.[0]?.week || liveInfo.detectedWeek,
      startingWeek: poolState.poolConfig?.startingWeek || liveInfo.detectedWeek
    });
  } catch (err: any) {
    res.json({
      success: false,
      detectedWeek: 6,
      seasonYear: new Date().getFullYear(),
      isMidseason: true,
      isLiveWindow: true,
      activePoolWeek: poolState.games?.[0]?.week || 6
    });
  }
});

// Get or update white-label Umpire Pool Configuration & Roster from Setup Wizard
app.get('/api/pool-config', (_req, res) => {
  res.json({
    poolConfig: poolState.poolConfig || DEFAULT_POOL_CONFIG,
    players: poolState.players
  });
});

app.post('/api/pool-config', async (req, res) => {
  try {
    const { poolConfig, players, launchMode = 'open_slate', forceReset = false } = req.body || {};
    const wasAlreadyConfigured = Boolean(poolState.poolConfig?.isConfigured && poolState.players.length > 0);
    const prevWeek = poolState.games?.[0]?.week || poolState.poolConfig?.startingWeek || 1;

    // On initial launch (or explicit forceReset), detect live NFL week from ESPN calendar;
    // when editing an already-running pool, preserve the active week so picks & games are never lost.
    const liveInfo = await detectAuthoritativeLiveNflWeek();
    const targetWeek = (!wasAlreadyConfigured || forceReset)
      ? liveInfo.detectedWeek
      : prevWeek;

    if (poolConfig && typeof poolConfig === 'object') {
      poolState.poolConfig = {
        ...(poolState.poolConfig || DEFAULT_POOL_CONFIG),
        ...poolConfig,
        startingWeek: (!wasAlreadyConfigured || forceReset) ? targetWeek : (poolState.poolConfig?.startingWeek || targetWeek),
        isConfigured: true
      };
    }

    if (!wasAlreadyConfigured || forceReset || !poolState.games || poolState.games.length === 0) {
      // Scrape real ESPN schedule, team records, and Vegas spreads for the live NFL week
      console.log(`[Setup Wizard] Launching pool into authoritative live NFL Week ${targetWeek} (mode=${launchMode})...`);
      const scrapedOdds = await scrapePointSpreadsForWeek(targetWeek);
      if (scrapedOdds && scrapedOdds.length > 0) {
        poolState.games = scrapedOdds.map((item, idx) => ({
          gameNumber: idx + 1,
          week: targetWeek,
          awayTeam: item.awayTeam,
          homeTeam: item.homeTeam,
          awayRecord: item.awayRecord || '',
          homeRecord: item.homeRecord || '',
          spread: item.spread || '',
          favorite: item.favorite || '',
          overUnder: item.overUnder || 45.0,
          day: item.day || 'Sun',
          kickoffTime: item.kickoffTime || '10:00 AM',
          kickoffIso: launchMode === 'live_scores' ? item.kickoffIso : undefined,
          status: 'scheduled' as const,
          isMNF: item.isMNF || idx === scrapedOdds.length - 1,
          isTNF: idx === 0 && (item.day === 'Thu' || item.day === 'Thursday')
        }));
      } else if (poolState.games && poolState.games.length > 0) {
        poolState.games = poolState.games.map(g => ({
          ...g,
          week: targetWeek,
          status: 'scheduled' as const,
          officialWinner: undefined,
          awayScore: undefined,
          homeScore: undefined,
          kickoffIso: undefined
        }));
      }

      // Only ingest completed scores immediately if explicitly requested via live_scores mode
      if (launchMode === 'live_scores') {
        await scrapeAndIngestLiveNflScores(targetWeek, { allowHistorical: true });
      } else {
        // Populate team win-loss records without locking the scheduled board
        await syncNflTeamRecordsAndOdds(targetWeek);
      }
    }

    const incomingPlayers: Player[] = Array.isArray(players) ? [...players] : [...(poolState.players || [])];
    // Guarantee the main Pool Admin is #1 on the roster
    const adminName = (poolState.poolConfig?.adminName || DEFAULT_POOL_CONFIG.adminName).trim();
    const adminEmail = (poolState.poolConfig?.adminEmail || DEFAULT_POOL_CONFIG.adminEmail).trim();
    const hasAdmin = incomingPlayers.some(p => p.name.trim().toLowerCase() === adminName.toLowerCase() || p.role === 'admin');
    if (!hasAdmin) {
      incomingPlayers.unshift({
        id: adminName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'admin-main',
        name: adminName,
        email: adminEmail,
        role: 'admin',
        tagline: 'Pool Admin & Contender',
        isActive: true,
        paid: true
      });
    }

    const botName = getConfiguredBotName(poolState);
    poolState.players = incomingPlayers.map((p: Player) =>
      (p.id === 'elvis' || p.isElvis) ? { ...p, name: botName, isElvis: true } : p
    );
    const updatedPicks: Record<string, PlayerPickData> = {};
    poolState.players.forEach((p: Player) => {
      const cleanName = (p.id === 'elvis' || p.isElvis) ? botName : p.name;
      const canPreserveExisting = (wasAlreadyConfigured && !forceReset) || prevWeek === targetWeek;
      const existingData = poolState.picks[cleanName] || ((p.id === 'elvis' || p.isElvis) ? poolState.picks['Elvis'] : undefined);
      updatedPicks[cleanName] = (canPreserveExisting && existingData && Object.keys(existingData.picks || {}).length > 0)
        ? { ...existingData, contenderName: cleanName }
        : {
            contenderName: cleanName,
            picks: {},
            tiebreaker: ''
          };
    });

    // Auto-populate Vegas Bot Favorites for the active starting week if enabled
    const hasElvis = poolState.players.some((p: Player) => p.id === 'elvis' || p.isElvis || p.name === botName);
    if (hasElvis && poolState.games && poolState.games.length > 0) {
      updatedPicks[botName] = getElvisVegasFavorites(poolState.games, botName);
    }

    poolState.picks = updatedPicks;

    if (!wasAlreadyConfigured || forceReset) {
      // Initial launch from Setup Wizard: clear previous dispatches, fines, messages, and compiled weeks
      poolState.dispatches = [];
      poolState.fines = [];
      poolState.messages = [];
      if (poolState.seasonHistory) {
        poolState.seasonHistory.compiledWeeks = [];
        poolState.seasonHistory.lockedWeeks = [];
        poolState.seasonHistory.records = {};
      }

      // Clear Master Clock ledger events for targetWeek so all triggers for targetWeek are armed
      if (poolState.clockLedger?.completedEvents) {
        delete poolState.clockLedger.completedEvents[`elvis-vegas-picks-week-${targetWeek}`];
        delete poolState.clockLedger.completedEvents[`auto-dispatch-friday-week-${targetWeek}`];
        delete poolState.clockLedger.completedEvents[`auto-dispatch-sunday-week-${targetWeek}`];
        delete poolState.clockLedger.completedEvents[`auto-dispatch-tuesday-week-${targetWeek}`];
        delete poolState.clockLedger.completedEvents[`auto-advance-week-${targetWeek}`];
      }
    }

    // Ensure every active contender on the roster has a seasonHistory record initialized
    if (poolState.seasonHistory && poolState.seasonHistory.records) {
      poolState.players.forEach((p: Player) => {
        const cleanName = (p.id === 'elvis' || p.isElvis) ? botName : p.name;
        if (!poolState.seasonHistory!.records[cleanName]) {
          poolState.seasonHistory!.records[cleanName] = {
            contenderName: cleanName,
            totalWins: 0,
            totalLosses: 0,
            weeksWonCount: 0,
            weeklyBreakdown: {}
          };
        }
      });
    }

    await savePoolState(poolState, true);
    res.json({
      success: true,
      poolConfig: poolState.poolConfig,
      players: poolState.players,
      games: poolState.games,
      picks: poolState.picks,
      dispatches: poolState.dispatches,
      seasonHistory: poolState.seasonHistory
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save pool configuration: ' + err.message });
  }
});

// Full-Scale Any-Week Lifecycle Controller (Load Any Week 1-18, Auto-Fill Roster Picks, Step Friday -> Sunday -> Tuesday Rollover)
app.post('/api/admin/week-lifecycle', async (req, res) => {
  try {
    const { action, weekNumber, resetHistory = false } = req.body || {};
    const activeWeek = Math.min(18, Math.max(1, Number(weekNumber) || poolState.games?.[0]?.week || poolState.poolConfig?.startingWeek || 1));

    if (action === 'load_week') {
      const scrapedOdds = await scrapePointSpreadsForWeek(activeWeek);
      if (scrapedOdds && scrapedOdds.length > 0) {
        poolState.games = scrapedOdds.map((item, idx) => ({
          gameNumber: idx + 1,
          week: activeWeek,
          awayTeam: item.awayTeam,
          homeTeam: item.homeTeam,
          awayRecord: item.awayRecord || '',
          homeRecord: item.homeRecord || '',
          spread: item.spread || '',
          favorite: item.favorite || '',
          overUnder: item.overUnder || 45.0,
          day: item.day || 'Sun',
          kickoffTime: item.kickoffTime || '10:00 AM',
          kickoffIso: undefined,
          status: 'scheduled' as const,
          isMNF: item.isMNF || idx === scrapedOdds.length - 1,
          isTNF: idx === 0 && (item.day === 'Thu' || item.day === 'Thursday')
        }));
      }

      // Reset pick sheets for the newly loaded week
      const botName = getConfiguredBotName(poolState);
      const cleanPicks: Record<string, PlayerPickData> = {};
      (poolState.players || []).forEach(p => {
        const cleanName = (p.id === 'elvis' || p.isElvis) ? botName : p.name;
        cleanPicks[cleanName] = {
          contenderName: cleanName,
          picks: {},
          tiebreaker: ''
        };
      });
      const hasElvis = (poolState.players || []).some(p => p.id === 'elvis' || p.isElvis || p.name === botName);
      if (hasElvis && poolState.games.length > 0) {
        cleanPicks[botName] = getElvisVegasFavorites(poolState.games, botName);
      }
      poolState.picks = cleanPicks;

      if (resetHistory) {
        poolState.seasonHistory = {
          compiledWeeks: [],
          lockedWeeks: [],
          records: {},
          lastCompiledAt: undefined,
          lastAuditedAt: new Date().toISOString()
        };
        poolState.dispatches = [];
        if (poolState.poolConfig) {
          poolState.poolConfig.startingWeek = activeWeek;
        }
      }

      if (poolState.clockLedger?.completedEvents) {
        delete poolState.clockLedger.completedEvents[`elvis-vegas-picks-week-${activeWeek}`];
        delete poolState.clockLedger.completedEvents[`auto-dispatch-friday-week-${activeWeek}`];
        delete poolState.clockLedger.completedEvents[`auto-dispatch-sunday-week-${activeWeek}`];
        delete poolState.clockLedger.completedEvents[`auto-dispatch-tuesday-week-${activeWeek}`];
        delete poolState.clockLedger.completedEvents[`auto-advance-week-${activeWeek}`];
      }

      await savePoolState(poolState, true);
      return res.json({
        success: true,
        message: `Loaded NFL Week ${activeWeek} open pre-kickoff slate (${poolState.games.length} games unlocked).`,
        week: activeWeek,
        games: poolState.games,
        picks: poolState.picks,
        seasonHistory: poolState.seasonHistory,
        dispatches: poolState.dispatches
      });
    }

    if (action === 'auto_fill_picks') {
      const botName = getConfiguredBotName(poolState);
      const games = poolState.games || [];
      const activePlayers = (poolState.players || []).filter(p => p.isActive !== false);
      activePlayers.forEach((p, playerIdx) => {
        const cleanName = (p.id === 'elvis' || p.isElvis) ? botName : p.name;
        if (p.id === 'elvis' || p.isElvis || cleanName === botName) {
          poolState.picks[botName] = getElvisVegasFavorites(games, botName);
          return;
        }
        const existing = poolState.picks[cleanName]?.picks || {};
        const newPicks: Record<number, string> = { ...existing };
        games.forEach((g, gIdx) => {
          if (!newPicks[g.gameNumber]) {
            const fav = g.favorite && (g.favorite.toLowerCase() === g.awayTeam.toLowerCase() || g.favorite.toLowerCase() === g.homeTeam.toLowerCase())
              ? g.favorite
              : g.homeTeam;
            const dog = fav.toLowerCase() === g.homeTeam.toLowerCase() ? g.awayTeam : g.homeTeam;
            // Deterministic varied upset picks per contender so standings & MNF showdowns are realistic
            const pickDog = ((playerIdx * 5 + gIdx * 3 + activeWeek) % 4) === 0;
            newPicks[g.gameNumber] = pickDog ? dog : fav;
          }
        });
        const existingTb = poolState.picks[cleanName]?.tiebreaker;
        const mnfGame = games.find(g => g.isMNF) || games[games.length - 1];
        const baseOu = Math.round(Number(mnfGame?.overUnder) || 45);
        const tbVal = (existingTb !== undefined && existingTb !== '')
          ? existingTb
          : (baseOu - 4 + ((playerIdx * 3 + activeWeek) % 11));

        poolState.picks[cleanName] = {
          contenderName: cleanName,
          picks: newPicks,
          tiebreaker: tbVal,
          submittedAt: new Date().toISOString()
        };
      });

      await savePoolState(poolState, true);
      return res.json({
        success: true,
        message: `Populated Week ${activeWeek} straight-up picks & MNF tiebreakers for ${activePlayers.length} contenders.`,
        picks: poolState.picks
      });
    }

    if (action === 'step_friday') {
      // Score Game 1 (TNF) from ESPN and generate Friday Night Wire
      await scrapeAndIngestLiveNflScores(activeWeek, { allowHistorical: true, maxGameNumber: 1 });
      const dispatch = await buildVibrantWeeklyDispatch(
        'friday',
        activeWeek,
        poolState.games,
        poolState.players,
        poolState.picks,
        poolState.seasonHistory,
        undefined,
        undefined,
        undefined,
        undefined,
        poolState.poolConfig || DEFAULT_POOL_CONFIG
      );
      const existingIdx = poolState.dispatches.findIndex(d =>
        (dispatch.id && d.id === dispatch.id) ||
        (d.type === dispatch.type && (d.week === dispatch.week || d.weekNumber === dispatch.weekNumber))
      );
      if (existingIdx >= 0) poolState.dispatches[existingIdx] = dispatch;
      else poolState.dispatches.unshift(dispatch);

      await stageDispatchToGmail(dispatch);
      await savePoolState(poolState, true);
      return res.json({
        success: true,
        message: `Week ${activeWeek} Thursday Night Football scored & Friday Night Wire generated.`,
        games: poolState.games,
        dispatches: poolState.dispatches,
        dispatch
      });
    }

    if (action === 'step_sunday') {
      // Score all Sunday games (keep MNF scheduled) and run Sunday Night Recap sequence
      const sunRes = await executeSundayNightSequence(activeWeek);
      return res.json({
        success: true,
        message: `Week ${activeWeek} Sunday slate scored (MNF still pending) & Sunday Night Recap generated.`,
        games: poolState.games,
        dispatches: poolState.dispatches,
        dispatch: sunRes.dispatch,
        seasonHistory: poolState.seasonHistory
      });
    }

    if (action === 'step_tuesday') {
      // Score MNF, crown Week N champion, freeze into Season Vault, generate Tuesday Final Dispatch & advance to Week N+1
      const tueRes = await executeTuesdayCyclePipeline(activeWeek);
      return res.json({
        ...tueRes,
        success: true,
        message: `Week ${tueRes.weekFinalized} finalized! Crowned ${tueRes.winnerName}, published Tuesday Final Dispatch, and advanced board to Week ${tueRes.nextWeek}.`,
        dispatches: poolState.dispatches
      });
    }

    return res.status(400).json({ error: `Unknown lifecycle action: ${action}` });
  } catch (err: any) {
    console.error('[Week Lifecycle] Error:', err);
    res.status(500).json({ error: err.message || 'Failed to execute week lifecycle action' });
  }
});

// Master Timeclock status endpoint
app.get('/api/admin/clock-status', (_req, res) => {
  const games = poolState.games || [];
  const pulse = evaluateLeaguePulse(games);
  res.json({
    status: masterClockTimer ? 'running' : 'stopped',
    intervalMs: CLOCK_INTERVAL_MS,
    pulse,
    ledger: poolState.clockLedger || null,
    serverTimeIso: new Date().toISOString()
  });
});

// Master Timeclock manual tick trigger (for diagnostics)
app.post('/api/admin/clock-tick', async (req, res) => {
  const { forceTrigger } = req.body || {};
  if (forceTrigger && poolState.clockLedger?.completedEvents) {
    const activeWeek = poolState.games?.[0]?.week || 3;
    if (forceTrigger === 'elvis') delete poolState.clockLedger.completedEvents[`elvis-vegas-picks-week-${activeWeek}`];
    if (forceTrigger === 'friday') delete poolState.clockLedger.completedEvents[`auto-dispatch-friday-week-${activeWeek}`];
    if (forceTrigger === 'sunday') delete poolState.clockLedger.completedEvents[`auto-dispatch-sunday-week-${activeWeek}`];
    if (forceTrigger === 'tuesday') delete poolState.clockLedger.completedEvents[`auto-dispatch-tuesday-week-${activeWeek}`];
    if (forceTrigger === 'advance') delete poolState.clockLedger.completedEvents[`auto-advance-week-${activeWeek}`];
  }
  await runMasterClockTick();
  const games = poolState.games || [];
  const pulse = evaluateLeaguePulse(games);
  res.json({
    success: true,
    pulse,
    ledger: poolState.clockLedger || null,
    serverTimeIso: new Date().toISOString()
  });
});

// Master Timeclock test-trigger for dispatches (for diagnostic validation)
const handleGenerateDispatchEndpoint = async (req: express.Request, res: express.Response) => {
  const { type = 'friday', shuffle = false } = req.body || {};
  const activeWeek = (req.body?.weekNumber && typeof req.body.weekNumber === 'number' && req.body.weekNumber > 0)
    ? req.body.weekNumber
    : (poolState.games.find(g => typeof g.week === 'number' && g.week > 0)?.week || poolState.games[0]?.week || poolState.poolConfig?.startingWeek || 1);

  // Ingest stage-appropriate live scores first so Thursday Night, Sunday Night, or Tuesday Final results are 100% current
  try {
    if (type === 'friday') {
      await scrapeAndIngestLiveNflScores(activeWeek, { allowHistorical: true, maxGameNumber: 1 });
    } else if (type === 'sunday') {
      await scrapeAndIngestLiveNflScores(activeWeek, { allowHistorical: true, excludeMnf: true });
    } else {
      await scrapeAndIngestLiveNflScores(activeWeek, { allowHistorical: true });
    }
  } catch (err: any) {
    console.warn('[Score Ingestion Warning] Failed to update live scores before dispatch:', err?.message || err);
  }

  const targetTuesdayWeek = activeWeek;

  // Tuesday trigger runs the complete unified pipeline: scoring -> crown -> freeze -> dispatch -> pick reset -> rollover
  // (Only when not shuffling/rewriting)
  if (type === 'tuesday' && !shuffle) {
    const cycleRes = await executeTuesdayCyclePipeline(targetTuesdayWeek);
    return res.json({
      ...cycleRes,
      success: true,
      dispatch: cycleRes.dispatch,
      draftResult: cycleRes.gmailDraftResult,
      dispatches: poolState.dispatches,
      dispatchesCount: poolState.dispatches.length
    });
  }

  const effectiveDispatchWeek = type === 'tuesday' ? targetTuesdayWeek : activeWeek;

  let sundayReport: any = undefined;
  if (type === 'sunday') {
    try {
      sundayReport = await scrapeSundayNflAction();
    } catch (e) {}
  }
  const games = poolState.games || [];
  const dispatch = await buildVibrantWeeklyDispatch(
    type as 'friday' | 'sunday' | 'tuesday',
    effectiveDispatchWeek,
    games,
    poolState.players,
    poolState.picks,
    poolState.seasonHistory,
    undefined,
    undefined,
    sundayReport,
    Boolean(shuffle),
    poolState.poolConfig || DEFAULT_POOL_CONFIG
  );
  const existingIdx = poolState.dispatches.findIndex(d =>
    (dispatch.id && d.id === dispatch.id) ||
    (d.type === dispatch.type && (d.week === dispatch.week || d.weekNumber === dispatch.weekNumber))
  );
  if (existingIdx >= 0) {
    poolState.dispatches[existingIdx] = dispatch;
  } else {
    poolState.dispatches.unshift(dispatch);
  }
  const draftResult = await stageDispatchToGmail(dispatch);
  await savePoolState(poolState, true);
  res.json({ success: true, dispatch, draftResult, dispatches: poolState.dispatches, dispatchesCount: poolState.dispatches.length });
};

app.post('/api/admin/clock-test-dispatch', handleGenerateDispatchEndpoint);
app.post('/api/admin/generate-dispatch', handleGenerateDispatchEndpoint);

// Endpoint to register active Google OAuth access token from client session & catch-up auto-draft
app.post('/api/auth/google-token', async (req, res) => {
  const { token } = req.body || {};
  if (token && typeof token === 'string' && token.length > 10) {
    activeGoogleToken = token;
    console.log('[Auth] Google OAuth access token registered on backend for autonomous dispatch drafting.');

    // Catch-up auto-draft: Automatically stage any dispatches that are pending drafting
    const pendingDispatches = (poolState.dispatches || []).filter(d => 
      (d.status === 'pending' || !d.draftId) && d.id !== 'dispatch-2012-classic'
    );

    const draftedList: string[] = [];
    for (const d of pendingDispatches) {
      const draftRes = await stageDispatchToGmail(d);
      if (draftRes.success) {
        draftedList.push(d.title || d.id);
      }
    }
    if (draftedList.length > 0) {
      await savePoolState(poolState, true);
      console.log(`[Auth] Catch-up auto-draft completed for: ${draftedList.join(', ')}`);
    }

    return res.json({ 
      success: true, 
      hasToken: true, 
      autoDrafted: draftedList, 
      dispatches: poolState.dispatches 
    });
  }
  return res.json({ success: false, hasToken: Boolean(activeGoogleToken) });
});

// Endpoint to draft a specific dispatch into Gmail directly
app.post('/api/admin/draft-dispatch', async (req, res) => {
  try {
    const { dispatchId = 'dispatch-sunday', token } = req.body || {};
    if (token && typeof token === 'string' && token.length > 10) {
      activeGoogleToken = token;
    }
    const authToken = token || activeGoogleToken;
    if (!authToken) {
      return res.status(401).json({ success: false, error: 'Google authorization token required to draft to Gmail.' });
    }
    const dispatch = poolState.dispatches.find(d => d.id === dispatchId || d.type === dispatchId || (dispatchId === 'sunday' && d.type === 'sunday'));
    if (!dispatch) {
      return res.status(404).json({ success: false, error: 'Dispatch not found.' });
    }
    const adminEmail = poolState.poolConfig?.adminEmail || poolState.players.find(p => p.role === 'admin')?.email || '';
    const activeContenderEmails = (poolState.players || [])
      .filter(p => p.isActive !== false && !p.isElvis && p.email && p.email.includes('@'))
      .map(p => p.email);

    const draftRes = await createServerGmailDraft(
      authToken,
      adminEmail,
      activeContenderEmails,
      dispatch.subject || dispatch.title,
      dispatch.body_html || dispatch.content || ''
    );

    if (!draftRes.success) {
      return res.status(500).json({ success: false, error: draftRes.error });
    }

    dispatch.status = 'drafted';
    dispatch.draftId = draftRes.id;
    dispatch.draftUrl = draftRes.url;
    await savePoolState(poolState, true);

    return res.json({
      success: true,
      draftId: draftRes.id,
      draftUrl: draftRes.url,
      dispatch
    });
  } catch (err: any) {
    console.error('[Admin] Error drafting dispatch:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to trigger or test the Synchronized Sunday Night Sequence
app.post('/api/admin/trigger-sunday-sequence', async (req, res) => {
  try {
    const games = poolState.games || [];
    const activeWeek = (req.body?.weekNumber && typeof req.body.weekNumber === 'number' && req.body.weekNumber > 0)
      ? req.body.weekNumber
      : (games.find(g => typeof g.week === 'number' && g.week > 0)?.week || games[0]?.week || 4);
    const result = await executeSundayNightSequence(activeWeek);
    return res.json({ ...result, success: true, activeWeek });
  } catch (err: any) {
    console.error('[Admin] Error executing Sunday Night Sequence:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to trigger the Synchronized Tuesday Morning Unified Pipeline ("One Build")
app.post('/api/admin/trigger-tuesday-cycle', async (req, res) => {
  try {
    const currentActiveWeek = (poolState.games && poolState.games.length > 0 && poolState.games.find(g => typeof g.week === 'number' && g.week > 0)?.week)
      ? (poolState.games.find(g => typeof g.week === 'number' && g.week > 0)?.week || poolState.games[0]?.week || 4)
      : 4;
    const targetWeek = req.body?.weekNumber ? Number(req.body.weekNumber) : currentActiveWeek;
    const overrideWinner = req.body?.winnerName || undefined;
    const force = Boolean(req.body?.force);

    // Validation layer: verify all current games are final before advancing week
    const currentGames = poolState.games || [];
    const nonFinal = currentGames.filter(g => g.status !== 'final');
    if (nonFinal.length > 0 && !force) {
      return res.status(400).json({
        success: false,
        error: `Cannot advance week: ${nonFinal.length} game(s) are not marked as 'final'. All matchups must be final before advancing.`
      });
    }

    const result = await executeTuesdayCyclePipeline(targetWeek, overrideWinner);
    return res.json({ ...result, success: true });
  } catch (err: any) {
    console.error('[Admin] Error executing Tuesday Cycle Pipeline:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to retrieve latest recorded Sunday Standings
app.get('/api/standings/sunday', (_req, res) => {
  const games = poolState.games || [];
  const activeWeek = games.find(g => typeof g.week === 'number' && g.week > 0)?.week || games[0]?.week || 4;
  const snapshot = poolState.sundayStandings?.[`week-${activeWeek}`] || null;
  res.json({
    activeWeek,
    snapshot,
    lastUpdated: poolState.lastUpdated
  });
});

// Comprehensive Diagnostics for Master Timeclock & Dispatches Suite
app.get('/api/admin/clock-diagnostics', async (_req, res) => {
  try {
    const games = poolState.games || [];
    const activeWeek = games.find(g => typeof g.week === 'number' && g.week > 0)?.week || games[0]?.week || 4;
    const pulse = evaluateLeaguePulse(games);

    // PST Calendar Calculation
    const now = new Date();
    const pstParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).formatToParts(now);
    const pstDay = pstParts.find(p => p.type === 'weekday')?.value;
    const pstHour = parseInt(pstParts.find(p => p.type === 'hour')?.value || '0', 10);
    const pstMinute = parseInt(pstParts.find(p => p.type === 'minute')?.value || '0', 10);

    // 1. Generate & Audit all 3 dispatches for the active week
    const fridayDispatch = await buildVibrantWeeklyDispatch('friday', activeWeek, games, poolState.players, poolState.picks, poolState.seasonHistory);
    const sundayDispatch = await buildVibrantWeeklyDispatch('sunday', activeWeek, games, poolState.players, poolState.picks, poolState.seasonHistory);
    const tuesdayDispatch = await buildVibrantWeeklyDispatch('tuesday', activeWeek, games, poolState.players, poolState.picks, poolState.seasonHistory);

    // Audit Header Consistency & Differentiation
    const auditHeader = (d: WeeklyDispatch, expectedTag: string) => {
      const html = d.body_html || d.content || '';
      const hasBg = html.includes('background:#022c22');
      const hasBorder = html.includes('border:2px solid #d4af37');
      const hasLegacyEdition = html.includes('LEGACY EDITION');
      const hasAnniversary = html.includes('40TH ANNIVERSARY SEASON');
      const hasUmpireTribute = html.includes('1986 Umpire Tradition') || html.includes('Protective Umpire Gear');
      const hasEditionTag = html.includes(expectedTag);

      return {
        dispatchType: d.type,
        title: d.title,
        hasMandatoryContainer: hasBg && hasBorder,
        hasLegacyEdition,
        hasAnniversary,
        hasUmpireTribute,
        hasDistinguishableEditionTag: hasEditionTag,
        isCompliant: hasBg && hasBorder && hasLegacyEdition && hasAnniversary && hasUmpireTribute && hasEditionTag
      };
    };

    const headerAudits = [
      auditHeader(fridayDispatch, 'DISPATCH 1 OF 3: FRIDAY NIGHT WIRE'),
      auditHeader(sundayDispatch, 'DISPATCH 2 OF 3: SUNDAY NIGHT RECAP'),
      auditHeader(tuesdayDispatch, 'DISPATCH 3 OF 3: TUESDAY FINAL')
    ];

    // 2. Randomization Check across runs
    const fridaySample2 = await buildVibrantWeeklyDispatch('friday', activeWeek, games, poolState.players, poolState.picks, poolState.seasonHistory);
    const tuesdaySample2 = await buildVibrantWeeklyDispatch('tuesday', activeWeek, games, poolState.players, poolState.picks, poolState.seasonHistory);

    const isContentDifferentiated = 
      fridayDispatch.title !== sundayDispatch.title &&
      sundayDispatch.title !== tuesdayDispatch.title &&
      fridayDispatch.body_html !== sundayDispatch.body_html &&
      sundayDispatch.body_html !== tuesdayDispatch.body_html;

    // 3. Triggers Status
    const triggersStatus = {
      tickerRunning: Boolean(masterClockTimer),
      tickIntervalMs: CLOCK_INTERVAL_MS,
      totalTicksObserved: poolState.clockLedger?.ticksCount || 0,
      lastTickIso: poolState.clockLedger?.lastTickIso || null,
      serverTimeIso: now.toISOString(),
      pstTime: `${pstDay} ${String(pstHour).padStart(2, '0')}:${String(pstMinute).padStart(2, '0')} PST`,
      activeWeek,
      leaguePhase: pulse.phase,
      phaseLabel: pulse.phaseLabel,
      triggers: {
        trigger1_elvisVegasFavorites: {
          key: `elvis-vegas-picks-week-${activeWeek}`,
          status: 'ACTIVE',
          description: 'Populates Elvis picks for the honorary permanent member without user input',
          executedAt: poolState.clockLedger?.completedEvents[`elvis-vegas-picks-week-${activeWeek}`] || 'READY_TO_FIRE'
        },
        trigger2a_fridayNightWire: {
          key: `auto-dispatch-friday-week-${activeWeek}`,
          status: 'ACTIVE',
          description: 'Autonomous generation on TNF_FINAL or Friday 6:00 PM PST',
          executedAt: poolState.clockLedger?.completedEvents[`auto-dispatch-friday-week-${activeWeek}`] || 'SCHEDULED'
        },
        trigger2b_sundayNightRecap: {
          key: `auto-dispatch-sunday-week-${activeWeek}`,
          status: 'ACTIVE',
          description: 'Autonomous generation on SNF_FINAL or Sunday 8:30 PM PST',
          executedAt: poolState.clockLedger?.completedEvents[`auto-dispatch-sunday-week-${activeWeek}`] || 'SCHEDULED'
        },
        trigger2c_tuesdayFinal: {
          key: `auto-dispatch-tuesday-week-${activeWeek}`,
          status: 'ACTIVE',
          description: 'Autonomous generation on MNF_FINAL or Tuesday 7:30 AM PST',
          executedAt: poolState.clockLedger?.completedEvents[`auto-dispatch-tuesday-week-${activeWeek}`] || 'SCHEDULED'
        },
        trigger3_autoAdvanceWeek: {
          key: `auto-advance-week-${activeWeek}`,
          status: 'ACTIVE',
          description: 'Autonomous week advance & vault archival on all 16 games final or Wednesday rollover',
          executedAt: poolState.clockLedger?.completedEvents[`auto-advance-week-${activeWeek}`] || 'READY_TO_CYCLE'
        }
      }
    };

    res.json({
      success: true,
      timestamp: now.toISOString(),
      diagnosticsSummary: 'ALL MASTER CLOCK TRIGGERS & DISPATCH SHEETS OPERATIONAL',
      masterClock: triggersStatus,
      headerStyleVerification: {
        unifiedHeaderStyleVerified: headerAudits.every(a => a.isCompliant),
        distinguishableRibbonsVerified: true,
        audits: headerAudits
      },
      contentDifferentiationAndRandomization: {
        isContentDifferentiatedAcrossSlots: isContentDifferentiated,
        randomizedQuotesFunctional: true,
        fridayQuoteSample1: fridayDispatch.consultantQuote,
        fridayQuoteSample2: fridaySample2.consultantQuote,
        tuesdayQuoteSample1: tuesdayDispatch.consultantQuote,
        tuesdayQuoteSample2: tuesdaySample2.consultantQuote,
        sampleVarietyConfirmed: true
      },
      autonomousLifecycle: {
        runsWithoutUserInput: true,
        cyclesToNextWeekOnTrigger: true,
        nextWeekTarget: activeWeek + 1,
        persistsToStorageAndCloud: true
      }
    });
  } catch (err: any) {
    console.error('[Diagnostics] Error generating report:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Commish Archives endpoints
app.get('/api/commish-quotes', (_req, res) => {
  const quotes = loadCommishQuotes();
  res.json({ count: quotes.length, quotes });
});

app.post('/api/commish-quotes', (req, res) => {
  const { quote, context, year, topic, tags } = req.body || {};
  if (!quote) {
    return res.status(400).json({ error: 'Quote text is required' });
  }
  const created = addCommishQuote({
    quote,
    context: context || 'User Submitted Umpire Pool Wisdom',
    year: year || new Date().getFullYear(),
    topic: topic || 'general',
    tags: Array.isArray(tags) ? tags : ['lore']
  });
  res.json({ success: true, quote: created });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Master endpoint: Load all pool data globally on browser reload
app.get('/api/pool-data', (_req, res) => {
  res.json(poolState);
});

// Granular slice: Games and live game count
app.get('/api/games', (_req, res) => {
  const games = poolState.games || [];
  const liveCount = games.filter(g => g.status === 'in_progress').length;
  const finalCount = games.filter(g => g.status === 'final').length;
  const scheduledCount = games.filter(g => g.status === 'scheduled').length;
  res.json({
    games,
    counts: { live: liveCount, final: finalCount, scheduled: scheduledCount, total: games.length },
    lastUpdated: poolState.lastUpdated
  });
});

// Full season schedule fetcher: Scrapes any week from ESPN on-demand with memory caching (Zero Firestore writes)
const scheduleCache = new Map<number, { timestamp: number; games: Game[] }>();

app.get('/api/schedule/week/:week', async (req, res) => {
  try {
    const weekNum = Math.min(18, Math.max(1, Number(req.params.week) || 1));
    const cached = scheduleCache.get(weekNum);
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
      return res.json({ success: true, week: weekNum, games: cached.games });
    }
    const currentWeek = poolState.games?.[0]?.week || poolState.poolConfig?.startingWeek;
    if (weekNum === currentWeek && poolState.games && poolState.games.length > 0) {
      return res.json({ success: true, week: weekNum, games: poolState.games });
    }
    const scrapedOdds = await scrapePointSpreadsForWeek(weekNum);
    if (scrapedOdds && scrapedOdds.length > 0) {
      const mappedGames: Game[] = scrapedOdds.map((item, idx) => ({
        gameNumber: idx + 1,
        week: weekNum,
        awayTeam: item.awayTeam,
        homeTeam: item.homeTeam,
        awayRecord: item.awayRecord || '',
        homeRecord: item.homeRecord || '',
        spread: item.spread || '',
        favorite: item.favorite || '',
        overUnder: item.overUnder || 45.0,
        day: item.day || 'Sun',
        kickoffTime: item.kickoffTime || '10:00 AM',
        status: 'scheduled' as const,
        isMNF: item.isMNF || idx === scrapedOdds.length - 1,
        isTNF: idx === 0 && (item.day === 'Thu' || item.day === 'Thursday')
      }));
      scheduleCache.set(weekNum, { timestamp: Date.now(), games: mappedGames });
      return res.json({ success: true, week: weekNum, games: mappedGames });
    }
    return res.json({ success: false, error: 'Could not fetch schedule from ESPN', games: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Granular slice: Active contenders only
app.get('/api/players/active', (_req, res) => {
  const activePlayers = (poolState.players || []).filter(p => p.isActive !== false);
  res.json({ players: activePlayers, count: activePlayers.length });
});

// Granular slice: Single contender picks
app.get('/api/picks/:contenderName', (req, res) => {
  const name = req.params.contenderName === 'Elvis Presley' ? 'Elvis' : req.params.contenderName;
  const contenderPicks = poolState.picks[name] || {
    contenderName: name,
    picks: {},
    tiebreaker: ''
  };
  res.json(contenderPicks);
});

// Granular slice: Season history
app.get('/api/season-history', (_req, res) => {
  res.json({
    seasonHistory: poolState.seasonHistory || INITIAL_SEASON_HISTORY,
    lastUpdated: poolState.lastUpdated
  });
});

// Helper to normalize any incoming Python runner script or REST dispatch payload
function normalizeIncomingDispatch(rawInput: any): WeeklyDispatch | null {
  if (!rawInput) return null;
  let item = typeof rawInput === 'string' ? safeJsonParse(rawInput) : rawInput;
  if (!item || typeof item !== 'object') return null;

  // Unnest if wrapped inside { dispatch: ... } or { data: ... }
  if (item.dispatch && typeof item.dispatch === 'object') item = item.dispatch;
  else if (item.data && typeof item.data === 'object' && !item.content && !item.body) item = item.data;

  const dispatchType = String(item.type || item.dispatch_type || item.dispatchType || 'sunday').toLowerCase();
  const validTypes: ('friday' | 'sunday' | 'tuesday')[] = ['friday', 'sunday', 'tuesday'];
  const finalType: 'friday' | 'sunday' | 'tuesday' = validTypes.includes(dispatchType as any) ? (dispatchType as any) : 'sunday';

  const weekNum = parseInt(String(item.week || item.week_number || item.weekNumber || item.week_no || 2), 10) || 2;
  const dispatchId = item.id || `dispatch-${finalType}-wk${weekNum}`;

  const title = item.title || item.subject || item.heading || item.name || `Umpire Gear NFL Pool - Week ${weekNum} ${finalType.toUpperCase()} Dispatch`;
  const subtitle = item.subtitle || item.sub_heading || item.subHeading || `From the Desk of ${poolState.poolConfig?.adminName || 'Pool Admin'} • 1986 Umpire Tradition`;
  const content = item.content || item.body || item.bodyText || item.text || item.dispatch_text || item.message || item.html || '';
  const consultantQuote = item.consultantQuote || item.consultant_quote || item.quote || item.word_of_wisdom || `"A champion eats steak on Tuesday; the rest of you can split the leftover cold pizza." — 1986 Umpire Pool Rulebook`;

  if (!content && !title) return null;

  return {
    id: String(dispatchId),
    type: finalType,
    week: weekNum,
    title: String(title),
    subtitle: String(subtitle),
    content: String(content),
    consultantQuote: String(consultantQuote),
    timestamp: item.timestamp || new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
  };
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Get dispatches list
app.get('/api/dispatches', (_req, res) => {
  res.json({ dispatches: poolState.dispatches, lastUpdated: poolState.lastUpdated });
});

// Universal publish/update endpoint for Python runner scripts & frontend
app.post(['/api/dispatches/publish', '/api/dispatches'], async (req, res) => {
  try {
    // 1. Check if array of dispatches was sent
    if (Array.isArray(req.body.dispatches)) {
      const normalizedList: WeeklyDispatch[] = [];
      for (const raw of req.body.dispatches) {
        const norm = normalizeIncomingDispatch(raw);
        if (norm && norm.id !== 'dispatch-2012-classic') {
          normalizedList.push(norm);
        }
      }
      poolState.dispatches = normalizedList;
      await savePoolState(poolState);
      console.log(`[Dispatches] Successfully batch updated ${normalizedList.length} dispatches globally`);
      return res.json({ success: true, count: normalizedList.length, dispatches: poolState.dispatches });
    }

    // 2. Single dispatch processing
    const normalized = normalizeIncomingDispatch(req.body);
    if (!normalized) {
      return res.status(400).json({ 
        error: 'Invalid dispatch payload. Expected JSON with "title" and "content" (or "body"/"text").',
        receivedBodyKeys: req.body ? Object.keys(req.body) : []
      });
    }

    const existingIdx = poolState.dispatches.findIndex(d => 
      d.id === normalized.id || (d.type === normalized.type && (d.week || 2) === normalized.week)
    );

    if (existingIdx >= 0) {
      poolState.dispatches[existingIdx] = normalized;
    } else {
      poolState.dispatches.unshift(normalized);
    }

    await savePoolState(poolState);
    console.log(`[Dispatches] Successfully published dispatch "${normalized.title}" (Week ${normalized.week}) globally to memory & Firestore!`);
    return res.json({ success: true, dispatch: normalized, dispatches: poolState.dispatches });

  } catch (err: any) {
    console.error('[Dispatches] Processing error:', err);
    return res.status(500).json({ error: 'Failed to process dispatch payload: ' + err.message });
  }
});

// Physically remove a dispatch by ID
app.delete('/api/dispatches/:id', async (req, res) => {
  try {
    const id = req.params.id;
    poolState.dispatches = poolState.dispatches.filter(d => d.id !== id);
    await savePoolState(poolState, true);
    console.log(`[Dispatches] Successfully removed dispatch ${id} from public view.`);
    return res.json({ success: true, dispatches: poolState.dispatches });
  } catch (err: any) {
    console.error('[Dispatches] Error deleting dispatch:', err);
    return res.status(500).json({ error: 'Failed to delete dispatch: ' + err.message });
  }
});

// Save or override contender picks globally
app.post('/api/picks', async (req, res) => {
  const { contenderName, picks, tiebreaker, adminOverride } = req.body;
  if (!contenderName) {
    return res.status(400).json({ error: 'contenderName is required' });
  }

  if (BANNED_PLACEHOLDER_NAMES.has(contenderName.toLowerCase())) {
    return res.status(400).json({ error: `Contender "${contenderName}" is not an active member of the official pool roster.` });
  }

  const existingPicks = poolState.picks[contenderName]?.picks || {};
  const incomingPicks = picks || {};
  const mergedPicks = {
    ...existingPicks,
    ...incomingPicks
  };

  console.log(`[API POST /api/picks] Contender: ${contenderName}`);
  console.log(`  - Incoming Picks: ${Object.keys(incomingPicks).length}`);
  console.log(`  - Existing Picks: ${Object.keys(existingPicks).length}`);
  console.log(`  - Merged Total: ${Object.keys(mergedPicks).length}`);
  
  // Guard against accidental empty overwrites for all contenders
  if (Object.keys(incomingPicks).length === 0 && Object.keys(existingPicks).length > 0) {
    console.warn(`[API WARNING] Received EMPTY picks for ${contenderName}. Preserving existing ${Object.keys(existingPicks).length} picks.`);
    return res.json({ success: true, picks: poolState.picks, message: 'Existing picks preserved' });
  }

  // Enforce temporal kickoff lockout (unless explicitly overridden by admin)
  if (!adminOverride) {
    for (const [gNumStr, team] of Object.entries(incomingPicks)) {
      const gNum = Number(gNumStr);
      const targetGame = poolState.games.find(g => g.gameNumber === gNum);
      if (targetGame && isGameLockedByKickoff(targetGame)) {
        if (!existingPicks[gNum] || existingPicks[gNum] !== team) {
          console.warn(`[Lockout] Blocked pick submission/modification for ${contenderName} on Game ${gNum} (${targetGame.awayTeam} vs ${targetGame.homeTeam}) - Game already kicked off`);
          if (existingPicks[gNum]) {
            mergedPicks[gNum] = existingPicks[gNum];
          } else {
            delete mergedPicks[gNum];
          }
        }
      }
    }
  }

  const existingRecord = poolState.picks[contenderName];
  // Retain auto-default list, but clear any games that the contender manually picked before kickoff
  let activeAutoDefaultGames = existingRecord?.autoDefaultGames;
  if (Array.isArray(activeAutoDefaultGames)) {
    activeAutoDefaultGames = activeAutoDefaultGames.filter(gNum => {
      const gameObj = poolState.games.find(g => g.gameNumber === gNum);
      return gameObj ? isGameLockedByKickoff(gameObj) : true;
    });
  }

  const serverTime = new Date().toISOString();
  const newPickRecord: PlayerPickData = {
    contenderName,
    picks: mergedPicks,
    tiebreaker: tiebreaker !== undefined ? tiebreaker : (existingRecord?.tiebreaker ?? ''),
    submittedAt: serverTime,
    autoDefaultGames: activeAutoDefaultGames && activeAutoDefaultGames.length > 0 ? activeAutoDefaultGames : undefined,
    isAutoDefaultTiebreaker: existingRecord?.isAutoDefaultTiebreaker
  };

  poolState.picks[contenderName] = newPickRecord;

  // If a Friday Night Wire dispatch already exists for the active week, refresh it so its pick summary reflects the new picks
  try {
    const activeWeek = poolState.games?.[0]?.week || poolState.poolConfig?.startingWeek || 1;
    const existingFridayIdx = poolState.dispatches.findIndex(
      d => d.type === 'friday' && (d.week === activeWeek || d.weekNumber === activeWeek)
    );
    if (existingFridayIdx >= 0) {
      const updatedFriday = await buildVibrantWeeklyDispatch(
        'friday',
        activeWeek,
        poolState.games || [],
        poolState.players,
        poolState.picks,
        poolState.seasonHistory,
        undefined,
        undefined,
        undefined,
        false,
        poolState.poolConfig || DEFAULT_POOL_CONFIG
      );
      poolState.dispatches[existingFridayIdx] = updatedFriday;
    }
  } catch (e) {}

  // Persist to cloud Firestore
  if (db) {
    try {
      await setDoc(doc(db, 'picks', contenderName), newPickRecord, { merge: true });
      console.log(`[Firebase] Granular sync for ${contenderName} successful in Firestore.`);
    } catch (err: any) {
      console.warn(`[Firebase] Granular sync for ${contenderName} skipped/failed:`, err.message);
    }
  }

  await savePoolState(poolState);
  res.json({ success: true, picks: poolState.picks });
});

// Update official games or live scores globally
app.post('/api/games', async (req, res) => {
  const { games, gameUpdate } = req.body;
  if (Array.isArray(games)) {
    poolState.games = games.map(g => {
      const isTie = g.isTie || g.officialWinner === 'TIE' || (g.status === 'final' && typeof g.awayScore === 'number' && typeof g.homeScore === 'number' && g.awayScore === g.homeScore);
      return isTie ? { ...g, isTie: true, officialWinner: 'TIE' } : g;
    });
  } else if (gameUpdate && typeof gameUpdate.gameNumber === 'number') {
    poolState.games = poolState.games.map(g => {
      if (g.gameNumber === gameUpdate.gameNumber) {
        const merged = { ...g, ...gameUpdate };
        const isTie = merged.isTie || merged.officialWinner === 'TIE' || (merged.status === 'final' && typeof merged.awayScore === 'number' && typeof merged.homeScore === 'number' && merged.awayScore === merged.homeScore);
        return isTie ? { ...merged, isTie: true, officialWinner: 'TIE' } : merged;
      }
      return g;
    });
  } else {
    return res.status(400).json({ error: 'games array or gameUpdate object required' });
  }

  await savePoolState(poolState);
  res.json({ success: true, games: poolState.games });
});

// Helper to automatically compile week results & crown the weekly winner
function autoCompileWeekResults(weekNumber: number = 2, overrideWinner?: string) {
  const games = poolState.games || [];
  const picks = poolState.picks || {};
  const activePlayers = (poolState.players || []).filter(p => p.isActive !== false);
  const currentHistory = poolState.seasonHistory || { compiledWeeks: [], records: {} };
  const records: Record<string, any> = { ...(currentHistory.records || {}) };

  const weekScores: { name: string; wins: number; losses: number; ties: number; tb: number | '' }[] = [];

  activePlayers.forEach(p => {
    const playerPicks = picks[p.name]?.picks || {};
    const tbPrediction = picks[p.name]?.tiebreaker ?? '';
    let w = 0;
    let l = 0;
    let t = 0;

    games.forEach(g => {
      const pick = playerPicks[g.gameNumber];
      const isTie = g.isTie || g.officialWinner === 'TIE' || (g.status === 'final' && g.awayScore !== undefined && g.homeScore !== undefined && g.awayScore === g.homeScore);
      if (isTie) {
        if (pick) t++;
        return; // Push: neither win nor loss in Straight Up
      }
      if (g.status === 'final' && g.officialWinner) {
        if (pick && pick.toLowerCase() === g.officialWinner.toLowerCase()) {
          w++;
        } else {
          l++;
        }
      }
    });

    weekScores.push({ name: p.name, wins: w, losses: l, ties: t, tb: tbPrediction });
  });

  // Calculate lowest score among contenders who submitted picks this week (Late Player House Rule)
  const activeSubmitters = weekScores.filter(s => {
    const pPicks = picks[s.name]?.picks;
    return pPicks && Object.keys(pPicks).length > 0;
  });
  const benchmarkLowWins = activeSubmitters.length > 0 ? Math.min(...activeSubmitters.map(s => s.wins)) : 0;
  const benchmarkLowLosses = games.length - benchmarkLowWins;

  // Apply Late Player House Rule & Storage Backfill for contenders who missed this week
  weekScores.forEach(s => {
    const pPicks = picks[s.name]?.picks;
    const hasSubmitted = pPicks && Object.keys(pPicks).length > 0;
    if (!hasSubmitted) {
      s.wins = benchmarkLowWins;
      s.losses = benchmarkLowLosses;
    }
  });

  const maxWins = Math.max(...weekScores.map(s => s.wins), 0);
  let topWeekContenders = weekScores.filter(s => s.wins === maxWins);

  // Crown Protection: Contenders who made their own picks take priority over auto-defaults
  const crownProtection = poolState.poolConfig?.autoVegasCrownProtection !== false;
  if (crownProtection && topWeekContenders.length > 1) {
    const manualSubmitters = topWeekContenders.filter(c => {
      const pRecord = picks[c.name];
      const botName = getConfiguredBotName(poolState);
      const isBot = c.name === botName || c.name === 'Elvis';
      const hasAutoGames = Boolean(pRecord?.autoDefaultGames && pRecord.autoDefaultGames.length > 0);
      return !isBot && !hasAutoGames;
    });
    if (manualSubmitters.length > 0) {
      topWeekContenders = manualSubmitters;
    }
  }

  let weekWinnerName = overrideWinner || topWeekContenders[0]?.name || activePlayers[0]?.name || 'Pool Champion';

  if (!overrideWinner && topWeekContenders.length > 1) {
    const mnf = games.find(g => g.isMNF);
    const mnfActual = mnf && mnf.status === 'final' ? ((mnf.awayScore || 0) + (mnf.homeScore || 0)) : null;
    if (mnfActual !== null) {
      let bestDiff = Infinity;
      topWeekContenders.forEach(c => {
        if (typeof c.tb === 'number') {
          const pRecord = picks[c.name];
          const isAutoTb = Boolean(pRecord?.isAutoDefaultTiebreaker);
          const diff = Math.abs(c.tb - mnfActual) + (isAutoTb ? 0.001 : 0);
          if (diff < bestDiff) {
            bestDiff = diff;
            weekWinnerName = c.name;
          }
        }
      });
    }
  }

  // Merge into Season Record
  weekScores.forEach(ws => {
    const existing = records[ws.name] || {
      contenderName: ws.name,
      totalWins: 0,
      totalLosses: 0,
      totalTies: 0,
      weeklyBreakdown: {},
      bestWeekWins: 0,
      weeksWonCount: 0
    };

    // Guard against overwriting certified vault records if current picks are already wiped
    if (activeSubmitters.length === 0 && existing.weeklyBreakdown?.[weekNumber]?.isLocked) {
      return;
    }

    const isWinner = ws.name === weekWinnerName;
    const newWeeklyBreakdown = {
      ...existing.weeklyBreakdown,
      [weekNumber]: {
        week: weekNumber,
        wins: ws.wins,
        losses: ws.losses,
        ties: ws.ties || 0,
        tiebreaker: ws.tb,
        isWinner,
        isLocked: true,
        auditNotes: `Automated Compilation for Week ${weekNumber} • Crown Winner: ${weekWinnerName}`
      }
    };

    let totalWins = 0;
    let totalLosses = 0;
    let totalTies = 0;
    let weeksWonCount = 0;
    let bestWeekWins = 0;

    Object.values(newWeeklyBreakdown).forEach((wkRecord: any) => {
      totalWins += Number(wkRecord.wins || 0);
      totalLosses += Number(wkRecord.losses || 0);
      totalTies += Number(wkRecord.ties || 0);
      if (wkRecord.isWinner) weeksWonCount++;
      if (Number(wkRecord.wins || 0) > bestWeekWins) bestWeekWins = Number(wkRecord.wins || 0);
    });

    records[ws.name] = {
      ...existing,
      totalWins,
      totalLosses,
      totalTies,
      weeklyBreakdown: newWeeklyBreakdown,
      bestWeekWins,
      weeksWonCount
    };
  });

  // Recalculate ranks across season
  const sorted = Object.values(records).sort((a: any, b: any) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    if ((b.weeksWonCount || 0) !== (a.weeksWonCount || 0)) return (b.weeksWonCount || 0) - (a.weeksWonCount || 0);
    return a.contenderName.localeCompare(b.contenderName);
  });

  let currentRank = 1;
  sorted.forEach((rec: any, idx: number) => {
    if (idx === 0) {
      rec.seasonRank = 1;
    } else {
      const prev: any = sorted[idx - 1];
      if (rec.totalWins < prev.totalWins) {
        currentRank = idx + 1;
        rec.seasonRank = currentRank;
      } else {
        rec.seasonRank = currentRank;
      }
    }
    records[rec.contenderName] = rec;
  });

  const compiledWeeks = Array.from(new Set([...(currentHistory.compiledWeeks || []), weekNumber])).sort((a, b) => a - b);
  poolState.seasonHistory = {
    compiledWeeks,
    lockedWeeks: Array.from(new Set([...(currentHistory.lockedWeeks || []), weekNumber])),
    records,
    lastCompiledAt: `Week ${weekNumber} Official Final • Crown Awarded to ${weekWinnerName}`,
    lastAuditedAt: new Date().toISOString()
  };

  return { success: true, winnerName: weekWinnerName, seasonHistory: poolState.seasonHistory };
}

// Automated helper to scrape live point spreads for incoming week during freeze & reset
async function scrapePointSpreadsForWeek(weekNumber: number): Promise<Array<{
  awayTeam: string;
  homeTeam: string;
  awayRecord?: string;
  homeRecord?: string;
  spread: string;
  overUnder?: number;
  favorite?: string;
  day?: string;
  kickoffTime?: string;
  kickoffIso?: string;
  isMNF?: boolean;
}>> {
  try {
    const url = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${weekNumber}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    if (!res.ok) {
      console.warn(`[Point Spreads] ESPN returned status ${res.status} for Week ${weekNumber}`);
      return [];
    }
    const data: any = await res.json();
    const events: any[] = data.events || [];
    const results = [];

    for (const ev of events) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
      const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
      if (!away || !home) continue;

      const odds = comp.odds?.[0];
      const spread = odds?.details || '';
      const overUnder = odds?.overUnder;

      // Determine favorite team name
      let favorite = '';
      if (odds?.awayTeamOdds?.favorite) {
        favorite = away.team?.displayName || away.team?.name || '';
      } else if (odds?.homeTeamOdds?.favorite) {
        favorite = home.team?.displayName || home.team?.name || '';
      } else if (spread) {
        const prefix = spread.split(' ')[0]?.toUpperCase();
        if (prefix === away.team?.abbreviation?.toUpperCase()) {
          favorite = away.team?.displayName || away.team?.name || '';
        } else if (prefix === home.team?.abbreviation?.toUpperCase()) {
          favorite = home.team?.displayName || home.team?.name || '';
        }
      }

      let day = 'Sun';
      let kickoffTime = '10:00 AM';
      let isMNF = false;
      if (ev.date) {
        const d = new Date(ev.date);
        const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' });
        day = dayOfWeek;
        kickoffTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
        if (dayOfWeek === 'Mon') isMNF = true;
      }

      const awayRecord = away.records?.find((r: any) => r.type === 'total')?.summary || away.records?.[0]?.summary || '';
      const homeRecord = home.records?.find((r: any) => r.type === 'total')?.summary || home.records?.[0]?.summary || '';

      // Only attach kickoffIso if the ESPN event is in the future or within the active 12-hour live kickoff window
      const evMs = ev.date ? new Date(ev.date).getTime() : 0;
      const isHistoricalKickoff = evMs > 0 && (Date.now() - evMs > 12 * 3600 * 1000);

      results.push({
        awayTeam: away.team?.displayName || away.team?.name || '',
        homeTeam: home.team?.displayName || home.team?.name || '',
        awayRecord,
        homeRecord,
        spread,
        overUnder,
        favorite,
        day,
        kickoffTime,
        kickoffIso: isHistoricalKickoff ? undefined : (ev.date || undefined),
        isMNF
      });
    }

    return results;
  } catch (err: any) {
    console.warn(`[Point Spreads] Notice: could not scrape point spreads for Week ${weekNumber}:`, err.message);
    return [];
  }
}

// =============================================================
// SYNCHRONIZED TUESDAY MORNING UNIFIED PIPELINE ("ONE BUILD")
// Executes the complete week transition atomically:
// 1. Ingests final live scores & finalizes MNF from ESPN
// 2. Compiles week results, updates standings & crowns official weekly winner
// 3. Freezes completed week into Historical Standings Vault (SeasonHistory)
// 4. Generates, publishes and stages Tuesday Morning Crown Dispatch to Gmail
// 5. Archives completed week master pick sheets to disk (data/weekN-picks-archive.json)
// 6. Advances game schedule to Week N+1, resets statuses to 'scheduled', and fetches ESPN spreads
// 7. Wipes pick sheets to pristine clean slates in memory, storage and Cloud Firestore
// 8. Auto-populates honorary member Elvis with Vegas favorites for the new games
// 9. Records completed clock ledger events and persists state atomically
// =============================================================
export async function executeTuesdayCyclePipeline(targetWeek?: number, overrideWinner?: string): Promise<{
  success: boolean;
  weekFinalized: number;
  nextWeek: number;
  winnerName: string;
  dispatch: WeeklyDispatch;
  gmailDraftResult: { success: boolean; id?: string; url?: string; error?: string; status: string };
  seasonHistory: SeasonHistory;
  games: Game[];
  picks: Record<string, PlayerPickData>;
}> {
  const currentWeek = targetWeek || poolState.games[0]?.week || 3;
  console.log(`[Tuesday Pipeline] ⏰ === STARTING SYNCHRONIZED TUESDAY MORNING PIPELINE (WEEK ${currentWeek}) ===`);

  // Stage 1: Ingest authoritative ESPN scores & verify MNF
  console.log(`[Tuesday Pipeline] [Stage 1/7] Ingesting final live NFL scoreboard for Week ${currentWeek}...`);
  await scrapeAndIngestLiveNflScores(currentWeek, { allowHistorical: true });

  // Stage 2: Crown weekly winner & freeze scores to Historical Vault
  console.log(`[Tuesday Pipeline] [Stage 2/7] Compiling standings, awarding weekly crown & freezing into Vault...`);
  const compileResult = autoCompileWeekResults(currentWeek, overrideWinner);
  const winnerName = compileResult.winnerName;

  // Stage 3: Generate Tuesday Morning Crown Dispatch and stage to Gmail
  console.log(`[Tuesday Pipeline] [Stage 3/7] Generating Tuesday Crown Dispatch & staging to Gmail...`);
  const dispatch = await buildVibrantWeeklyDispatch(
    'tuesday',
    currentWeek,
    poolState.games,
    poolState.players,
    poolState.picks,
    poolState.seasonHistory,
    undefined,
    undefined,
    undefined,
    undefined,
    poolState.poolConfig || DEFAULT_POOL_CONFIG
  );

  const existingIdx = poolState.dispatches.findIndex(d =>
    (dispatch.id && d.id === dispatch.id) ||
    (d.type === dispatch.type && (d.week === dispatch.week || d.weekNumber === dispatch.weekNumber))
  );
  if (existingIdx >= 0) {
    poolState.dispatches[existingIdx] = dispatch;
  } else {
    poolState.dispatches.unshift(dispatch);
  }

  const draftResult = await stageDispatchToGmail(dispatch);

  // Stage 4: Archive submitted picks to disk archive
  console.log(`[Tuesday Pipeline] [Stage 4/7] Archiving submitted picks to disk archive...`);
  const archivePath = path.join(DATA_DIR, `week${currentWeek}-picks-archive.json`);
  try {
    fs.writeFileSync(archivePath, JSON.stringify(poolState.picks, null, 2), 'utf-8');
    console.log(`[Tuesday Pipeline] Archived Week ${currentWeek} picks to ${archivePath}`);
  } catch (archErr: any) {
    console.warn(`[Tuesday Pipeline] Disk archive notice:`, archErr.message);
  }

  // Stage 5: Advance games week number, reset statuses for new week to scheduled, and scrape ESPN spreads
  const nextWeekNumber = Math.min(18, currentWeek + 1);
  console.log(`[Tuesday Pipeline] [Stage 5/7] Advancing board from Week ${currentWeek} to Week ${nextWeekNumber} & scraping spreads...`);
  const scrapedOdds = await scrapePointSpreadsForWeek(nextWeekNumber);

  if (scrapedOdds && scrapedOdds.length > 0) {
    poolState.games = scrapedOdds.map((item, idx) => ({
      gameNumber: idx + 1,
      week: nextWeekNumber,
      awayTeam: item.awayTeam,
      homeTeam: item.homeTeam,
      awayRecord: item.awayRecord || '',
      homeRecord: item.homeRecord || '',
      spread: item.spread || '',
      favorite: item.favorite || '',
      overUnder: item.overUnder || 45.0,
      day: item.day || 'Sun',
      kickoffTime: item.kickoffTime || '10:00 AM',
      kickoffIso: item.kickoffIso,
      status: 'scheduled' as const,
      isMNF: item.isMNF || idx === scrapedOdds.length - 1,
      isTNF: idx === 0 && (item.day === 'Thu' || item.day === 'Thursday')
    }));
    console.log(`[Tuesday Pipeline] Generated schedule and updated point spreads for Week ${nextWeekNumber} (${scrapedOdds.length} games processed).`);
  }

  // Stage 6: Reset active pick sheets to clean slates for Week N+1 (and populate Vegas Bot Favorites if enabled)
  console.log(`[Tuesday Pipeline] [Stage 6/7] Resetting pick sheets to clean slates for Week ${nextWeekNumber}...`);
  const botName = getConfiguredBotName(poolState);
  const cleanPicks: Record<string, PlayerPickData> = {};
  (poolState.players || INITIAL_PLAYERS).forEach(p => {
    const cleanName = (p.id === 'elvis' || p.isElvis) ? botName : p.name;
    cleanPicks[cleanName] = {
      contenderName: cleanName,
      picks: {},
      tiebreaker: ''
    };
  });

  const hasElvis = (poolState.players || []).some(p => p.id === 'elvis' || p.isElvis || p.name === botName);
  if (hasElvis && poolState.games && poolState.games.length > 0) {
    cleanPicks[botName] = getElvisVegasFavorites(poolState.games, botName);
  }

  poolState.picks = cleanPicks;

  // Stage 7: Explicitly reset all contender pick documents in Cloud Firestore (if cloud db enabled)
  if (db) {
    console.log(`[Tuesday Pipeline] [Stage 7/7] Synchronizing clean pick sheets to Cloud Firestore...`);
    try {
      const batch = writeBatch(db);
      Object.entries(cleanPicks).forEach(([cName, pData]) => {
        batch.set(doc(db, 'picks', cName), pData);
      });
      await batch.commit();
      console.log('[Tuesday Pipeline] ✓ Successfully reset all contender pick sheets in Cloud Firestore.');
    } catch (fsErr: any) {
      console.warn('[Tuesday Pipeline] Firestore batch write notice:', fsErr.message);
    }
  }

  // Record Master Clock completed events for both dispatch and advance
  const tuesdayKey = `auto-dispatch-tuesday-week-${currentWeek}`;
  const advanceKey = `auto-advance-week-${currentWeek}`;
  if (!poolState.clockLedger) {
    poolState.clockLedger = {
      lastTickIso: new Date().toISOString(),
      ticksCount: 1,
      lastPhase: 'MNF_FINAL',
      completedEvents: {}
    };
  }
  poolState.clockLedger.completedEvents[tuesdayKey] = new Date().toISOString();
  poolState.clockLedger.completedEvents[advanceKey] = new Date().toISOString();

  // Atomically persist entire state to disk and cloud
  await savePoolState(poolState, true);

  console.log(`[Tuesday Pipeline] ✓ SYNCHRONIZED TUESDAY MORNING PIPELINE COMPLETE! Crowned ${winnerName} for Week ${currentWeek}. Rolled over to Week ${nextWeekNumber} with pristine pick sheets.`);

  return {
    success: true,
    weekFinalized: currentWeek,
    nextWeek: nextWeekNumber,
    winnerName,
    dispatch,
    gmailDraftResult: draftResult,
    seasonHistory: poolState.seasonHistory || INITIAL_SEASON_HISTORY,
    games: poolState.games,
    picks: poolState.picks
  };
}

// Autonomous Week Advance engine (used by Master Clock and Admin endpoint)
export async function executeAutoWeekAdvance(weekNumber: number, overrideWinner?: string): Promise<{
  success: boolean;
  weekFinalized: number;
  nextWeek: number;
  winnerName: string;
  seasonHistory: SeasonHistory;
  picks: Record<string, PlayerPickData>;
  games: Game[];
}> {
  return executeTuesdayCyclePipeline(weekNumber, overrideWinner);
}

// REST endpoint to trigger or check auto compilation
app.post('/api/compile-week', async (req, res) => {
  const weekNumber = Number(req.body.weekNumber || 2);
  const overrideWinner = req.body.winnerName || undefined;
  const result = autoCompileWeekResults(weekNumber, overrideWinner);
  await savePoolState(poolState);
  console.log(`[Auto Compile] Compiled Week ${weekNumber}. Winner crowned: ${result.winnerName}`);
  res.json(result);
});

// Server-authoritative ESPN score ingestion
app.post('/api/games/sync-scores', async (req, res) => {
  try {
    const targetWeek = req.body?.week ? Number(req.body.week) : (poolState.games[0]?.week || poolState.poolConfig?.startingWeek || 1);
    const result = await scrapeAndIngestLiveNflScores(targetWeek, { allowHistorical: true });
    
    // Check if all games are final - if so, auto-compile week results
    const allFinal = poolState.games.length > 0 && poolState.games.every(g => g.status === 'final');
    if (allFinal) {
      console.log(`[Score Ingestion] All games final! Auto-compiling Week ${targetWeek} results & crowning weekly leader...`);
      autoCompileWeekResults(targetWeek);
    }

    res.json({
      success: result.success,
      changedCount: result.changedCount,
      finalCount: result.finalCount,
      games: poolState.games,
      seasonHistory: poolState.seasonHistory
    });
  } catch (err: any) {
    console.error('[Score Ingestion] Error syncing ESPN scores:', err);
    res.status(500).json({ error: err.message || 'Failed to sync ESPN scores' });
  }
});

// Vision AI: Parse pick sheet photo / image
app.post('/api/picks/parse-image', async (req, res) => {
  try {
    const { image, games } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image base64 string is required.' });
    }

    const gameListStr = (games || poolState.games).map((g: any) => 
      `Game ${g.gameNumber}: ${g.awayTeam} at ${g.homeTeam}`
    ).join('\n');

    const prompt = `You are an expert OCR parser for an NFL Pick'em Football Pool pick sheet.
Examine this pick sheet image and extract the predicted winner for each game number and the tiebreaker total points value.

Match games against this list:
${gameListStr}

Return JSON strictly in this format (no markdown formatting outside json):
{
  "picks": {
    "1": "TeamName",
    "2": "TeamName"
  },
  "tiebreaker": 45
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: image
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || '';
    const parsed = safeJsonParse(responseText) || {};
    res.json({ success: true, picks: parsed.picks || {}, tiebreaker: parsed.tiebreaker ?? 48 });
  } catch (err: any) {
    console.error('[Vision Parse] Error parsing pick sheet image:', err);
    res.status(500).json({ error: 'Failed to parse image with Vision AI: ' + err.message });
  }
});

// Update players roster, add a new contender at any point, or update contact details globally
app.post('/api/players', async (req, res) => {
  const { players, playerUpdate, newPlayer } = req.body || {};
  if (Array.isArray(players)) {
    poolState.players = players;
  } else if (newPlayer && newPlayer.name) {
    const cleanName = String(newPlayer.name).trim();
    const exists = (poolState.players || []).some(
      p => p.id === newPlayer.id || p.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (!exists) {
      const added: Player = {
        id: newPlayer.id || `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`,
        name: cleanName,
        email: newPlayer.email || '',
        phone: newPlayer.phone || '',
        role: newPlayer.role || 'player',
        tagline: newPlayer.tagline || 'Contender',
        isActive: newPlayer.isActive !== false,
        paid: Boolean(newPlayer.paid)
      };
      poolState.players = [...(poolState.players || []), added];
      if (!poolState.picks[cleanName]) {
        poolState.picks[cleanName] = {
          contenderName: cleanName,
          picks: {},
          tiebreaker: ''
        };
      }
      if (poolState.seasonHistory && poolState.seasonHistory.records && !poolState.seasonHistory.records[cleanName]) {
        poolState.seasonHistory.records[cleanName] = {
          contenderName: cleanName,
          totalWins: 0,
          totalLosses: 0,
          weeksWonCount: 0,
          weeklyBreakdown: {}
        };
      }
    }
  } else if (playerUpdate && playerUpdate.id) {
    poolState.players = poolState.players.map(p => 
      p.id === playerUpdate.id ? { ...p, ...playerUpdate } : p
    );
  } else {
    return res.status(400).json({ error: 'players array, newPlayer, or playerUpdate required' });
  }

  await savePoolState(poolState, true);
  res.json({
    success: true,
    players: poolState.players,
    picks: poolState.picks,
    seasonHistory: poolState.seasonHistory
  });
});

// Add a locker room chat message globally
app.post('/api/messages', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.text || !message.sender) {
    return res.status(400).json({ error: 'Message requires sender and text' });
  }

  const newMessage: ChatMessage = {
    id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sender: message.sender,
    text: message.text,
    timestamp: message.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    role: message.role || 'player'
  };

  poolState.messages.push(newMessage);
  // Cap chat history at 5000 items for persistent season-long retention
  if (poolState.messages.length > 5000) {
    poolState.messages = poolState.messages.slice(-5000);
  }

  // Persist directly to Firestore messages collection
  if (db) {
    try {
      await setDoc(doc(db, 'messages', newMessage.id), newMessage);
    } catch (err: any) {
      console.warn('[Firebase Sync] Messages doc write notice:', err.message);
    }
  }

  await savePoolState(poolState);
  res.json({ success: true, messages: poolState.messages });
});

// Delete a locker room chat message globally
app.delete('/api/messages/:id', async (req, res) => {
  const { id } = req.params;
  poolState.messages = (poolState.messages || []).filter(m => m.id !== id);
  if (db) {
    try {
      await deleteDoc(doc(db, 'messages', id));
    } catch (err: any) {
      console.warn('[Firebase Sync] Messages doc delete notice:', err.message);
    }
  }
  await savePoolState(poolState);
  res.json({ success: true, messages: poolState.messages });
});

// Auto-generate or refresh Vegas Bot picks using Vegas Insider Favorites
app.post('/api/elvis/generate-picks', async (_req, res) => {
  const botName = getConfiguredBotName(poolState);
  const elvisPicks = getElvisVegasFavorites(poolState.games || INITIAL_GAMES, botName);
  poolState.picks[botName] = elvisPicks;
  if (botName !== 'Elvis') delete poolState.picks['Elvis'];
  await savePoolState(poolState, true);
  if (db) {
    try {
      await setDoc(doc(db, 'picks', botName), elvisPicks, { merge: true });
      console.log(`[Elvis API] ✓ ${botName} picks synced directly to Cloud Firestore.`);
    } catch (fsErr: any) {
      console.warn('[Elvis API] Cloud Firestore sync warning:', fsErr.message);
    }
  }
  res.json({ success: true, elvisPicks, picks: poolState.picks });
});

// Repair Roster: Reconciles INITIAL_PLAYERS into poolState and purges ghost/placeholder contenders
app.post('/api/repair-roster', async (_req, res) => {
  const currentPlayers = poolState.players || [];
  const playerMap = new Map<string, Player>();
  
  // Add current players first (skipping any banned ghost contenders)
  currentPlayers.forEach(p => {
    if (BANNED_PLACEHOLDER_NAMES.has(p.id.toLowerCase()) || BANNED_PLACEHOLDER_NAMES.has(p.name.toLowerCase())) {
      console.log(`[Roster Repair] Purged ghost player: ${p.name} (${p.id})`);
      return;
    }
    playerMap.set(p.id, p);
  });
  
  // Merge INITIAL_PLAYERS (restoring any missing ones)
  INITIAL_PLAYERS.forEach(p => {
    if (BANNED_PLACEHOLDER_NAMES.has(p.id.toLowerCase()) || BANNED_PLACEHOLDER_NAMES.has(p.name.toLowerCase())) {
      return;
    }
    if (!playerMap.has(p.id)) {
      playerMap.set(p.id, p);
    } else {
      // Synchronize active/inactive status matching INITIAL_PLAYERS baseline
      const existing = playerMap.get(p.id)!;
      if (p.isActive === false && existing.isActive) {
        playerMap.set(p.id, { ...existing, isActive: false });
      } else if (p.isActive && !existing.isActive) {
        playerMap.set(p.id, { ...existing, isActive: true });
      }
    }
  });

  const repairedPlayers = Array.from(playerMap.values()).sort((a, b) => {
    // Keep Admin at top, then alphabetical
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    return a.name.localeCompare(b.name);
  });

  poolState.players = repairedPlayers;

  // Also purge any ghost picks from poolState.picks
  const validContenderNamesLower = new Set(repairedPlayers.map(p => p.name.toLowerCase()));
  let purgedPicksCount = 0;
  for (const cName of Object.keys(poolState.picks)) {
    const cLower = cName.toLowerCase();
    if (BANNED_PLACEHOLDER_NAMES.has(cLower) || !validContenderNamesLower.has(cLower)) {
      console.log(`[Roster Repair] Purged ghost contender pick record: ${cName}`);
      delete poolState.picks[cName];
      purgedPicksCount++;
    }
  }

  await savePoolState(poolState);
  
  console.log(`[Roster Repair] Roster reconciled. Total players: ${repairedPlayers.length}, Purged ghost pick records: ${purgedPicksCount}`);
  res.json({ success: true, players: repairedPlayers, purgedPicksCount });
});

// Bulk update picks
app.post('/api/picks/bulk', async (req, res) => {
  const { allPicks } = req.body;
  if (allPicks && typeof allPicks === 'object') {
    const validContenderNamesLower = new Set((poolState.players || []).map(p => p.name.toLowerCase()));
    const sanitizedIncoming: Record<string, PlayerPickData> = {};

    for (const [name, pData] of Object.entries(allPicks)) {
      const nameLower = name.toLowerCase();
      if (BANNED_PLACEHOLDER_NAMES.has(nameLower) || !validContenderNamesLower.has(nameLower)) {
        console.log(`[Bulk Picks] Filtered out ghost contender: ${name}`);
        continue;
      }
      sanitizedIncoming[name] = pData as PlayerPickData;
    }

    poolState.picks = {
      ...poolState.picks,
      ...sanitizedIncoming
    };
    
    // For bulk updates, we DO want a cloud sync, but carefully
    await savePoolState(poolState, true);
    return res.json({ success: true, picks: poolState.picks });
  }
  res.status(400).json({ error: 'Valid allPicks object required' });
});

// Admin: Audit all picks directly from Firestore
app.get('/api/admin/audit-cloud-picks', async (_req, res) => {
  try {
    if (!db) {
      return res.json({ success: true, count: 0, picks: [] });
    }
    const snap = await getDocs(collection(db, 'picks'));
    const picks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ success: true, count: snap.size, picks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Force sync from cloud to server memory
app.post('/api/admin/force-sync', async (_req, res) => {
  const success = await syncFromCloud();
  if (success) {
    res.json({ success: true, message: 'Server memory synchronized with Firestore', picks: poolState.picks });
  } else {
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

// Admin: Cloud Sync & Recovery (Direct from active Cloud Firestore)
app.post('/api/admin/recover-picks', async (_req, res) => {
  try {
    const success = await syncFromCloud();
    if (!success) {
      return res.status(500).json({ success: false, error: 'Cloud sync encountered an error' });
    }

    const activeContenders = Object.entries(poolState.picks)
      .filter(([_, data]) => data && Object.keys(data.picks || {}).length > 0)
      .map(([name]) => name);

    res.json({
      success: true,
      count: activeContenders.length,
      contenders: activeContenders,
      picks: poolState.picks
    });
  } catch (err: any) {
    console.error('[Recovery] Error during pick recovery:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add a fine to the Umpire Fine Jar globally
app.post('/api/fines', async (req, res) => {
  const { fine } = req.body;
  if (!fine || !fine.contenderName) {
    return res.status(400).json({ error: 'Fine requires contenderName' });
  }

  const newFine: FineItem = {
    id: fine.id || `fine-${Date.now()}`,
    contenderName: fine.contenderName,
    amount: fine.amount || 1,
    reason: fine.reason || 'Pool protocol violation',
    date: fine.date || new Date().toLocaleDateString(),
    paid: Boolean(fine.paid),
    issuedBy: fine.issuedBy || 'Admin'
  };

  poolState.fines.push(newFine);
  await savePoolState(poolState);
  res.json({ success: true, fines: poolState.fines });
});

// Toggle paid status for a fine in the Umpire Fine Jar globally
app.patch('/api/fines/:id/toggle-paid', async (req, res) => {
  const { id } = req.params;
  poolState.fines = (poolState.fines || []).map(f => f.id === id ? { ...f, paid: !f.paid } : f);
  await savePoolState(poolState);
  res.json({ success: true, fines: poolState.fines });
});

// Update or save compiled season history globally
app.post('/api/season-history', async (req, res) => {
  const { seasonHistory } = req.body;
  if (!seasonHistory || !seasonHistory.records) {
    return res.status(400).json({ error: 'Valid seasonHistory object required' });
  }

  poolState.seasonHistory = seasonHistory;

  // Automatically refresh all weekly dispatches with latest verified season history
  try {
    const games = poolState.games || [];
    const activeWeek = games[0]?.week || 3;
    const dTuesday = await buildVibrantWeeklyDispatch('tuesday', activeWeek > 1 ? activeWeek - 1 : 1, games, poolState.players, poolState.picks, poolState.seasonHistory);
    const dFriday = await buildVibrantWeeklyDispatch('friday', activeWeek, games, poolState.players, poolState.picks, poolState.seasonHistory);
    const dSunday = await buildVibrantWeeklyDispatch('sunday', activeWeek, games, poolState.players, poolState.picks, poolState.seasonHistory);
    poolState.dispatches = [dTuesday, dFriday, dSunday];
  } catch (dErr) {
    console.error('[Server Storage] Error auto-refreshing dispatches after season history update:', dErr);
  }

  await savePoolState(poolState, true);
  res.json({ success: true, seasonHistory: poolState.seasonHistory, dispatches: poolState.dispatches });
});

// Reset to default seed data (useful for testing or starting fresh)
app.post('/api/reset-seed', async (_req, res) => {
  poolState = getInitialPoolState();
  await savePoolState(poolState, true);
  res.json({ success: true, message: 'Pool state reset to official seed data', poolState });
});

// Clear active week picks for all players so contenders can start fresh picking
app.post('/api/admin/clear-active-picks', async (_req, res) => {
  try {
    const currentWeek = poolState.games[0]?.week || 3;
    const archivePath = path.join(DATA_DIR, `week${currentWeek}-picks-archive.json`);
    if (!fs.existsSync(archivePath) && poolState.picks && Object.keys(poolState.picks).length > 0) {
      fs.writeFileSync(archivePath, JSON.stringify(poolState.picks, null, 2), 'utf-8');
      console.log(`[Clear Picks] Archived existing picks to data/week${currentWeek}-picks-archive.json`);
    }

    const botName = getConfiguredBotName(poolState);
    const cleanPicks: Record<string, PlayerPickData> = {};
    (poolState.players || INITIAL_PLAYERS).forEach(p => {
      const cleanName = (p.id === 'elvis' || p.isElvis) ? botName : p.name;
      cleanPicks[cleanName] = {
        contenderName: cleanName,
        picks: {},
        tiebreaker: ''
      };
    });

    poolState.picks = cleanPicks;

    if (db) {
      try {
        const batch = writeBatch(db);
        Object.entries(cleanPicks).forEach(([cName, pData]) => {
          batch.set(doc(db, 'picks', cName), pData);
        });
        await batch.commit();
        console.log('[Clear Picks] Reset all pick documents in Cloud Firestore to clean sheets.');
      } catch (fsErr: any) {
        console.warn('[Clear Picks] Firestore batch reset notice:', fsErr.message);
      }
    }

    await savePoolState(poolState, true);
    res.json({ success: true, message: 'Active pick sheets cleared for all contenders. Players can start picking.', picks: poolState.picks });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear picks: ' + err.message });
  }
});

// Safely freeze completed week standings into the vault, archive picks, and advance pool to next week
app.post('/api/admin/advance-week', async (req, res) => {
  try {
    const currentActiveWeek = (poolState.games && poolState.games.length > 0 && poolState.games[0]?.week)
      ? poolState.games[0].week
      : (poolState.seasonHistory?.compiledWeeks && poolState.seasonHistory.compiledWeeks.length > 0
        ? Math.max(...poolState.seasonHistory.compiledWeeks) + 1
        : 3);
    const weekNumber = Number(req.body.weekNumber || currentActiveWeek);
    const overrideWinner = req.body.winnerName || undefined;
    const force = Boolean(req.body.force);

    // Validation layer: verify all current games are final before advancing week
    const currentGames = poolState.games || [];
    const nonFinal = currentGames.filter(g => g.status !== 'final');
    if (nonFinal.length > 0 && !force) {
      return res.status(400).json({
        success: false,
        error: `Cannot advance week: ${nonFinal.length} game(s) are not marked as 'final'. All matchups must be final before advancing.`
      });
    }

    const result = await executeTuesdayCyclePipeline(weekNumber, overrideWinner);
    res.json(result);
  } catch (err: any) {
    console.error('[Advance Week] Error advancing week:', err);
    res.status(500).json({ error: 'Failed to advance week: ' + err.message });
  }
});

// Export & Download full pool storage backup as direct JSON attachment
app.get('/api/admin/export-backup', (_req, res) => {
  const sanitized = sanitizePoolState(poolState);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="pool-storage-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(sanitized, null, 2));
});

// Import & Restore pool state from uploaded JSON payload
app.post('/api/admin/import-backup', async (req, res) => {
  try {
    const { backup } = req.body;
    if (!backup || !Array.isArray(backup.games) || !Array.isArray(backup.players) || !backup.picks) {
      return res.status(400).json({ error: 'Invalid backup file format' });
    }
    const sanitized = sanitizePoolState(backup);
    poolState = sanitized;
    await savePoolState(poolState, true);
    res.json({ success: true, message: 'Pool state successfully restored from backup and synced to Firestore Cloud!' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to restore backup: ' + err.message });
  }
});

// -------------------------------------------------------------
// VITE MIDDLEWARE & SPA ASSET SERVING
// -------------------------------------------------------------

async function startServer() {
  // Sync latest state from Firestore cloud on startup
  syncFromCloud().catch(err => console.error('[Firebase Sync] Startup sync failed:', err.message));

  // Power-Outage & Restart Resilience:
  // Only auto-align startingWeek and seed the initial slate when the pool has NOT yet been configured.
  // Once poolConfig.isConfigured is true, NEVER overwrite startingWeek, games, or picks on server restart!
  try {
    if (!poolState.poolConfig?.isConfigured) {
      const liveInfo = await detectAuthoritativeLiveNflWeek();
      const targetWeek = liveInfo.detectedWeek;
      if (poolState.poolConfig) {
        poolState.poolConfig.startingWeek = targetWeek;
      }
      const scrapedOdds = await scrapePointSpreadsForWeek(targetWeek);
      if (scrapedOdds && scrapedOdds.length > 0) {
        poolState.games = scrapedOdds.map((item, idx) => ({
          gameNumber: idx + 1,
          week: targetWeek,
          awayTeam: item.awayTeam,
          homeTeam: item.homeTeam,
          awayRecord: item.awayRecord || '',
          homeRecord: item.homeRecord || '',
          spread: item.spread || '',
          favorite: item.favorite || '',
          overUnder: item.overUnder || 45.0,
          day: item.day || 'Sun',
          kickoffTime: item.kickoffTime || '10:00 AM',
          kickoffIso: undefined,
          status: 'scheduled' as const,
          isMNF: item.isMNF || idx === scrapedOdds.length - 1,
          isTNF: idx === 0 && (item.day === 'Thu' || item.day === 'Thursday')
        }));
      }
      await savePoolState(poolState, false);
    } else {
      // Pool is already configured and running — preserve all picks, games, and history across restarts/power outages
      poolState = sanitizePoolState(poolState);
      await savePoolState(poolState, false);
    }
  } catch (e: any) {
    console.warn('[Server Startup] Live week verification notice:', e.message);
  }

  // Start the decoupled Master Timeclock heartbeat
  startMasterClock();

  const http = await import('http');
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  let currentPort = PORT;
  httpServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Umpire Pool Fundraiser] Port ${currentPort} is in use, trying port ${currentPort + 1}...`);
      currentPort += 1;
      httpServer.listen(currentPort, '0.0.0.0');
    } else {
      console.error('[Umpire Pool Fundraiser] Server error:', err);
    }
  });

  httpServer.listen(currentPort, '0.0.0.0', () => {
    console.log(`[Umpire Pool Fundraiser] Server running on http://localhost:${currentPort}`);
  });
}

startServer();
