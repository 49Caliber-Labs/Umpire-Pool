import { Game, Player, PlayerPickData, WeeklyDispatch, ChatMessage, FineItem, SeasonHistory } from '../types';

/**
 * Storage keys currently in active use across the pool application
 */
export const ACTIVE_STORAGE_KEYS = {
  ACTIVE_PLAYER_ID: 'nfl_pool_active_player_id_v2',
  GAMES: 'nfl_pool_games_v8',
  PLAYERS: 'nfl_pool_players_v10',
  PICKS: 'nfl_pool_picks_v13',
  DISPATCHES: 'nfl_pool_dispatches_v4',
  MESSAGES: 'nfl_pool_messages_v2',
  FINES: 'nfl_pool_fines_v3',
  SEASON_HISTORY: 'nfl_pool_season_history_v5',
  LAST_CLEANUP: 'nfl_pool_last_storage_cleanup'
} as const;

/**
 * Empty set for public white-label template so any contender name (Mike, Matt, Chris, Tom, etc.) is allowed
 */
export const BANNED_PLACEHOLDER_NAMES = new Set<string>([]);

/**
 * Prunes obsolete and legacy keys accumulated in localStorage during iterative development
 */
export function pruneLegacyLocalStorage(): { prunedCount: number; prunedKeys: string[] } {
  const prunedKeys: string[] = [];
  if (typeof window === 'undefined' || !window.localStorage) {
    return { prunedCount: 0, prunedKeys };
  }

  try {
    const activeKeySet = new Set(Object.values(ACTIVE_STORAGE_KEYS));
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) allKeys.push(key);
    }

    // Pattern for obsolete nfl pool keys
    const legacyPatterns = [
      /^nfl_pool_active_player_id$/,
      /^nfl_pool_games_v[1-7]$/,
      /^nfl_pool_players_v[1-9]$/,
      /^nfl_pool_picks_v(12|11|10|[1-9])$/,
      /^nfl_pool_dispatches_v[1-3]$/,
      /^nfl_pool_messages_v1$/,
      /^nfl_pool_fines_v[1-2]$/,
      /^nfl_pool_season_history_v[1-4]$/,
      /^umpire_pool_setup_config_v[1-3]$/,
      /^nfl_pool_history_old/,
      /^nfl_pool_temp_/,
      /^nfl_pool_draft_picks_/,
      /^nfl_pool_matrix_cache/
    ];

    for (const key of allKeys) {
      if (activeKeySet.has(key as any)) continue;

      const isLegacy = legacyPatterns.some(pattern => pattern.test(key));
      if (isLegacy) {
        localStorage.removeItem(key);
        prunedKeys.push(key);
      }
    }

    // Also sanitize active picks and players in localStorage to purge any ghost contenders
    const picksJson = localStorage.getItem(ACTIVE_STORAGE_KEYS.PICKS);
    if (picksJson) {
      try {
        const parsedPicks: Record<string, any> = JSON.parse(picksJson);
        let changed = false;
        for (const name of Object.keys(parsedPicks)) {
          if (BANNED_PLACEHOLDER_NAMES.has(name.toLowerCase())) {
            delete parsedPicks[name];
            changed = true;
            prunedKeys.push(`ghost_pick_${name}`);
          }
        }
        if (changed) {
          localStorage.setItem(ACTIVE_STORAGE_KEYS.PICKS, JSON.stringify(parsedPicks));
        }
      } catch (e) {}
    }

    const playersJson = localStorage.getItem(ACTIVE_STORAGE_KEYS.PLAYERS);
    if (playersJson) {
      try {
        const parsedPlayers: Player[] = JSON.parse(playersJson);
        const filtered = parsedPlayers.filter(p => !BANNED_PLACEHOLDER_NAMES.has(p.name.toLowerCase()) && !BANNED_PLACEHOLDER_NAMES.has(p.id.toLowerCase()));
        if (filtered.length !== parsedPlayers.length) {
          localStorage.setItem(ACTIVE_STORAGE_KEYS.PLAYERS, JSON.stringify(filtered));
          prunedKeys.push(`ghost_players_purged`);
        }
      } catch (e) {}
    }

    const dispatchesJson = localStorage.getItem(ACTIVE_STORAGE_KEYS.DISPATCHES);
    if (dispatchesJson) {
      try {
        const parsedDispatches: WeeklyDispatch[] = JSON.parse(dispatchesJson);
        const filtered = parsedDispatches.filter(d => d && d.id && d.id !== 'dispatch-2012-classic');
        if (filtered.length !== parsedDispatches.length) {
          localStorage.setItem(ACTIVE_STORAGE_KEYS.DISPATCHES, JSON.stringify(filtered));
          prunedKeys.push(`legacy_dispatches_purged`);
        }
      } catch (e) {}
    }

    localStorage.setItem(ACTIVE_STORAGE_KEYS.LAST_CLEANUP, new Date().toISOString());
  } catch (err) {
    console.warn('[StorageSanitizer] Could not prune localStorage:', err);
  }

  return { prunedCount: prunedKeys.length, prunedKeys };
}

/**
 * Normalizes a contender's pick data to ensure minimal and typed shape
 */
export function normalizePickData(
  contenderName: string,
  rawPickData?: Partial<PlayerPickData> | null,
  games?: Game[]
): PlayerPickData {
  const normalizedPicks: Record<number, string> = {};

  if (rawPickData && rawPickData.picks) {
    for (const [gameNumStr, team] of Object.entries(rawPickData.picks)) {
      const gNum = parseInt(gameNumStr, 10);
      if (!isNaN(gNum) && typeof team === 'string' && team.trim()) {
        const trimmed = team.trim();
        // If games are provided, validate that the picked team belongs to this game
        if (games && games.length > 0) {
          const game = games.find(g => g.gameNumber === gNum);
          if (game) {
            const away = game.awayTeam.toLowerCase();
            const home = game.homeTeam.toLowerCase();
            const pickedLower = trimmed.toLowerCase();
            const matchesGame = 
              away.includes(pickedLower) || pickedLower.includes(away) ||
              home.includes(pickedLower) || pickedLower.includes(home);
            if (!matchesGame) {
              // Pick is for a team not in this game (stale cross-week artifact) - omit it
              continue;
            }
          }
        }
        normalizedPicks[gNum] = trimmed;
      }
    }
  }

  let tiebreaker: number | '' = '';
  if (rawPickData && rawPickData.tiebreaker !== undefined && rawPickData.tiebreaker !== '') {
    const num = typeof rawPickData.tiebreaker === 'number' 
      ? rawPickData.tiebreaker 
      : parseInt(String(rawPickData.tiebreaker), 10);
    if (!isNaN(num) && num >= 0 && num <= 200) {
      tiebreaker = num;
    }
  }

  return {
    contenderName,
    picks: normalizedPicks,
    tiebreaker,
    submittedAt: rawPickData?.submittedAt || undefined
  };
}

/**
 * Normalizes the full collection of contender picks
 */
export function normalizeAllPicks(
  rawPicks: Record<string, PlayerPickData>,
  players: Player[],
  games?: Game[]
): Record<string, PlayerPickData> {
  const normalized: Record<string, PlayerPickData> = {};
  const processedRawKeys = new Set<string>();

  // Use a case-insensitive lookup map for raw picks
  const rawPicksLower: Record<string, { key: string; data: PlayerPickData }> = {};
  Object.entries(rawPicks).forEach(([key, data]) => {
    rawPicksLower[key.toLowerCase()] = { key, data };
  });

  // First seed with official players on the roster (ignoring any banned placeholder names)
  for (const player of players) {
    if (BANNED_PLACEHOLDER_NAMES.has(player.name.toLowerCase()) || BANNED_PLACEHOLDER_NAMES.has(player.id.toLowerCase())) {
      continue;
    }

    const pName = player.name;
    const pNameLower = pName.toLowerCase();
    
    // Find raw data by exact name, then by lowercase name, then special cases
    let raw = rawPicks[pName];
    let foundKey = pName;

    if (!raw && rawPicksLower[pNameLower]) {
      raw = rawPicksLower[pNameLower].data;
      foundKey = rawPicksLower[pNameLower].key;
    }
    
    // Handle Elvis special case
    if (!raw && pName === 'Elvis' && rawPicksLower['elvis presley']) {
      raw = rawPicksLower['elvis presley'].data;
      foundKey = 'Elvis Presley';
    }

    normalized[pName] = normalizePickData(pName, raw, games);
    if (raw) processedRawKeys.add(foundKey);
  }

  // Strictly reject any ghost, legacy, or placeholder contenders not in the official roster.
  // This guarantees ghost contenders will never populate the pool or leaderboard again.
  return normalized;
}

/**
 * Normalizes the game list to eliminate unindexed or redundant fields
 */
export function normalizeGames(rawGames: Game[]): Game[] {
  return rawGames.map(g => ({
    gameNumber: g.gameNumber,
    awayTeam: g.awayTeam,
    homeTeam: g.homeTeam,
    day: g.day,
    kickoffTime: g.kickoffTime,
    officialWinner: g.officialWinner ?? null,
    status: g.status,
    awayScore: typeof g.awayScore === 'number' ? g.awayScore : undefined,
    homeScore: typeof g.homeScore === 'number' ? g.homeScore : undefined,
    favorite: g.favorite,
    spread: g.spread,
    overUnder: typeof g.overUnder === 'number' ? g.overUnder : 45.5,
    isMNF: Boolean(g.isMNF),
    week: typeof g.week === 'number' ? g.week : 6,
    awayRecord: g.awayRecord || '',
    homeRecord: g.homeRecord || '',
    kickoffIso: g.kickoffIso,
    quarter: g.quarter,
    clock: g.clock,
    statusDetail: g.statusDetail,
    possession: g.possession,
    downDistance: g.downDistance,
    redzone: g.redzone,
    lastPlay: g.lastPlay,
    lastUpdated: g.lastUpdated
  }));
}

/**
 * Determines whether a game has officially kicked off based on game status or kickoff timestamp
 */
export function isGameLockedByKickoff(game: Game, currentTime: number = Date.now()): boolean {
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

