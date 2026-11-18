import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { GoogleGenAI } from '@google/genai';
import firebaseConfig from '../../firebase-applet-config.json';
import { Game, Player, PlayerPickData } from '../types';
import { getSavedPoolConfig } from '../config/leagueConfig';

const ai = new GoogleGenAI({
  apiKey: (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ? process.env.GEMINI_API_KEY : 'unconfigured',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const ALL_SCOPES = [GMAIL_COMPOSE_SCOPE, GMAIL_READONLY_SCOPE].join(' ');

// Initialize Firebase App safely if config is present
let app: any = null;
let authInstance: any = null;

try {
  if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    authInstance = getAuth(app);
  }
} catch (e) {
  console.warn('[GmailAuth] Firebase app initialization deferred or unavailable:', e);
}

export const auth = authInstance;

let cachedProvider: GoogleAuthProvider | null = null;
function getGoogleAuthProvider(): GoogleAuthProvider {
  if (!cachedProvider) {
    cachedProvider = new GoogleAuthProvider();
    cachedProvider.addScope(GMAIL_COMPOSE_SCOPE);
    cachedProvider.addScope(GMAIL_READONLY_SCOPE);
  }
  return cachedProvider;
}

// In-memory & session token cache (persisted across tab refreshes during active browser session)
let cachedAccessToken: string | null = (typeof window !== 'undefined' && window.sessionStorage) 
  ? window.sessionStorage.getItem('nfl_pool_google_token') 
  : null;
let currentUser: User | null = null;
let isSigningIn = false;

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (token) {
        window.sessionStorage.setItem('nfl_pool_google_token', token);
      } else {
        window.sessionStorage.removeItem('nfl_pool_google_token');
      }
    }
  } catch (e) {}
};

/**
 * Synchronizes the active Google token with the backend server so global clock triggers can auto-draft
 */
export const syncGoogleAuthWithServer = async (token?: string): Promise<{ success: boolean; hasToken: boolean; autoDrafted?: string[] }> => {
  const activeToken = token || cachedAccessToken || (typeof window !== 'undefined' ? window.sessionStorage?.getItem('nfl_pool_google_token') : null);
  if (!activeToken) return { success: false, hasToken: false };
  try {
    const res = await fetch('/api/auth/google-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: activeToken })
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (e) {}
  return { success: false, hasToken: false };
};

/**
 * Attempts a silent background token acquisition via Google Identity Services without showing a popup
 */
export const trySilentGoogleAuth = async (): Promise<string | null> => {
  if (cachedAccessToken) {
    await syncGoogleAuthWithServer(cachedAccessToken);
    return cachedAccessToken;
  }
  if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2 || !firebaseConfig?.oAuthClientId) {
    return null;
  }
  try {
    const token = await new Promise<string | null>((resolve) => {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: firebaseConfig.oAuthClientId,
          scope: ALL_SCOPES,
          callback: (tokenResponse: any) => {
            if (tokenResponse?.access_token) {
              setCachedAccessToken(tokenResponse.access_token);
              syncGoogleAuthWithServer(tokenResponse.access_token);
              resolve(tokenResponse.access_token);
            } else {
              resolve(null);
            }
          },
          error_callback: () => resolve(null)
        });
        client.requestAccessToken({ prompt: '' });
      } catch (err) {
        resolve(null);
      }
    });
    return token;
  } catch (e) {
    return null;
  }
};

/**
 * Initialize auth listener with error handling to avoid unhandled network-request-failed rejections
 */
export const initGmailAuth = (
  onSuccess?: (user: User, token: string) => void,
  onSignedOut?: () => void
) => {
  if (!auth) {
    return () => {};
  }

  try {
    return onAuthStateChanged(
      auth,
      async (user: User | null) => {
        try {
          currentUser = user;
          if (user && cachedAccessToken) {
            if (onSuccess) onSuccess(user, cachedAccessToken);
          } else if (!user) {
            cachedAccessToken = null;
            if (onSignedOut) onSignedOut();
          }
        } catch (e) {
          console.warn('[GmailAuth] Auth state change handler warning:', e);
        }
      },
      (error: any) => {
        // Handle auth/network-request-failed and other transient network issues gracefully
        console.warn('[GmailAuth] Handled network/auth listener notification:', error?.message || error);
      }
    );
  } catch (err) {
    console.warn('[GmailAuth] onAuthStateChanged setup warning:', err);
    return () => {};
  }
};

/**
 * Clear cached in-memory access token
 */
export const clearCachedToken = () => {
  cachedAccessToken = null;
  currentUser = null;
};

/**
 * Trigger Google Sign-In with Gmail Compose scope.
 * Uses Google Identity Services (GSI) as primary or Firebase Auth popup as fallback.
 */
export const signInWithGoogle = async (forcePrompt = false): Promise<{ user: User | null; token: string }> => {
  if (forcePrompt) {
    cachedAccessToken = null;
  }

  if (cachedAccessToken) {
    return { user: currentUser, token: cachedAccessToken };
  }

  isSigningIn = true;
  try {
    // 1. First attempt Google Identity Services (GSI) if available (most reliable in client/iframe environments)
    if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2 && firebaseConfig?.oAuthClientId) {
      try {
        const gsiResult = await new Promise<{ user: any; token: string }>((resolve, reject) => {
          try {
            const client = (window as any).google.accounts.oauth2.initTokenClient({
              client_id: firebaseConfig.oAuthClientId,
              scope: ALL_SCOPES,
              callback: (tokenResponse: any) => {
                if (tokenResponse.error) {
                  reject(new Error(tokenResponse.error_description || tokenResponse.error));
                  return;
                }
                setCachedAccessToken(tokenResponse.access_token);
                syncGoogleAuthWithServer(tokenResponse.access_token);
                const cfg = getSavedPoolConfig();
                currentUser = {
                  email: cfg.adminEmail || 'admin@example.org',
                  displayName: cfg.adminName || 'Pool Admin',
                  uid: 'pool-admin'
                } as any;
                resolve({ user: currentUser, token: tokenResponse.access_token });
              },
              error_callback: (err: any) => {
                reject(new Error(err?.message || 'Google Auth dialog closed or unavailable'));
              }
            });
            client.requestAccessToken();
          } catch (initErr: any) {
            reject(initErr);
          }
        });

        return gsiResult;
      } catch (gsiErr: any) {
        console.warn('[GmailAuth] GSI direct attempt notification, trying Firebase Auth popup fallback:', gsiErr?.message || gsiErr);
      }
    }

    // 2. Fallback to Firebase Auth popup if auth is initialized
    if (auth) {
      const result = await signInWithPopup(auth, getGoogleAuthProvider());
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error('No access token returned from Google Auth');
      }

      setCachedAccessToken(token);
      syncGoogleAuthWithServer(token);
      currentUser = result.user;
      return { user: result.user, token };
    }

    throw new Error('Google authorization client is not available. You can use the "Copy Dispatch" button to copy and send via your email client.');
  } catch (firebaseErr: any) {
    console.warn('[GmailAuth] Google authentication notice:', firebaseErr?.message || firebaseErr);

    const errorMessage = firebaseErr?.code === 'auth/network-request-failed'
      ? 'Network request failed when connecting to Google Auth in this browser view. You can open the app in a new tab or use the "Copy Dispatch" button to send directly.'
      : firebaseErr?.message || 'Google authorization could not be completed in this view. Use the Copy button to send via your mail client.';

    throw new Error(errorMessage);
  } finally {
    isSigningIn = false;
  }
};

/**
 * Disconnect Google Account & clear in-memory token
 */
export const signOutGoogle = async () => {
  try {
    await signOut(auth);
  } catch (e) {}
  cachedAccessToken = null;
  currentUser = null;
};

/**
 * Get current in-memory access token
 */
export const getCachedAccessToken = (): string | null => cachedAccessToken;

/**
 * Safely encode UTF-8 string to base64url for RFC 2822 email payload
 */
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Create a draft directly in the user's Gmail Draft folder via the Gmail API
 */
export const createGmailDraft = async (params: {
  subject: string;
  bodyText: string;
  to: string;
  bccList: string[];
  token?: string;
}): Promise<{ id: string; messageId: string; draftUrl: string }> => {
  const token = params.token || cachedAccessToken;
  if (!token) {
    throw new Error('Google authorization is required. Please sign in to Google to create drafts.');
  }

  const bccHeader = params.bccList && params.bccList.length > 0 
    ? `Bcc: ${params.bccList.join(', ')}\r\n` 
    : '';

  const isHtml = /<[a-z][\s\S]*>/i.test(params.bodyText);
  const contentType = isHtml ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8';

  // RFC 2822 raw email format
  const rawEmail = 
    `To: ${params.to}\r\n` +
    bccHeader +
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: ${contentType}\r\n` +
    `Content-Transfer-Encoding: 8bit\r\n\r\n` +
    params.bodyText;

  const encodedMessage = toBase64Url(rawEmail);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
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

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null;
    }
    const errData = await response.json().catch(() => ({}));
    const message = errData.error?.message || `Gmail API error (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  const draftUrl = `https://mail.google.com/mail/u/0/#drafts`;

  return {
    id: data.id,
    messageId: data.message?.id || data.id,
    draftUrl
  };
};

/**
 * Send an email directly via the Gmail API to contenders
 */
export const sendGmailMessage = async (params: {
  subject: string;
  bodyText: string;
  to: string;
  bccList: string[];
  token?: string;
}): Promise<{ id: string; threadId: string }> => {
  const token = params.token || cachedAccessToken;
  if (!token) {
    throw new Error('Google authorization is required. Please sign in to Google to send dispatches.');
  }

  const bccHeader = params.bccList && params.bccList.length > 0 
    ? `Bcc: ${params.bccList.join(', ')}\r\n` 
    : '';

  const isHtml = /<[a-z][\s\S]*>/i.test(params.bodyText);
  const contentType = isHtml ? 'text/html; charset=UTF-8' : 'text/plain; charset=UTF-8';

  // RFC 2822 raw email format
  const rawEmail = 
    `To: ${params.to}\r\n` +
    bccHeader +
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: ${contentType}\r\n` +
    `Content-Transfer-Encoding: 8bit\r\n\r\n` +
    params.bodyText;

  const encodedMessage = toBase64Url(rawEmail);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: encodedMessage
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      cachedAccessToken = null;
    }
    const errData = await response.json().catch(() => ({}));
    const message = errData.error?.message || `Gmail API send error (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  return {
    id: data.id,
    threadId: data.threadId || data.id
  };
};

/**
 * Fetch a list of message summaries from Gmail matching a query
 */
export const listGmailMessages = async (query: string, token?: string): Promise<any[]> => {
  const authToken = token || cachedAccessToken;
  if (!authToken) throw new Error('Auth token required');

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) throw new Error('Failed to list Gmail messages');
  const data = await response.json();
  return data.messages || [];
};

/**
 * Fetch a full message by ID
 */
export const getGmailMessage = async (id: string, token?: string): Promise<any> => {
  const authToken = token || cachedAccessToken;
  if (!authToken) throw new Error('Auth token required');

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!response.ok) throw new Error('Failed to fetch Gmail message');
  return await response.json();
};

/**
 * Extract pick data from unstructured email text using pattern matching
 */
export const parsePicksFromText = (text: string, games: Game[]): { picks: Record<number, string>; tiebreaker: number | '' } => {
  const picks: Record<number, string> = {};
  let tiebreaker: number | '' = '';

  // Clean up text
  const lines = text.split('\n').map(l => l.trim().toLowerCase());
  
  // Try to find games
  games.forEach(g => {
    const gameNum = g.gameNumber;
    const home = g.homeTeam.toLowerCase();
    const away = g.awayTeam.toLowerCase();
    
    // Extract mascot/nickname if possible (e.g. "Chargers" from "Los Angeles (Chargers)")
    const homeNickname = home.match(/\((.*?)\)/)?.[1] || home.split(' ').pop() || '';
    const awayNickname = away.match(/\((.*?)\)/)?.[1] || away.split(' ').pop() || '';

    for (const line of lines) {
      // Look for lines that mention the game or team names
      if (line.includes(home) || line.includes(away) || 
          (homeNickname && line.includes(homeNickname)) || 
          (awayNickname && line.includes(awayNickname))) {
        
        // If the line contains a winner preference
        if (line.includes(home) || (homeNickname && line.includes(homeNickname))) {
          picks[gameNum] = g.homeTeam;
          break;
        } else if (line.includes(away) || (awayNickname && line.includes(awayNickname))) {
          picks[gameNum] = g.awayTeam;
          break;
        }
      }
    }
  });

  // Try to find tiebreaker (looking for "tiebreaker", "points", "score", or just a standalone number near the end)
  const tbMatch = text.match(/(?:tiebreaker|points|total|score)[\s:]*(\d+)/i) || 
                  text.match(/\n\s*(\d{2,3})\s*$/);
  if (tbMatch) {
    tiebreaker = parseInt(tbMatch[1], 10);
  }

  return { picks, tiebreaker };
};

/**
 * Generate formatted dispatch content using TypeScript mathematical scenario evaluation
 * and the @google/genai SDK for autonomous, dynamic Crew Chief email drafting.
 */
export const generateDispatchPayload = async (
  type: 'friday' | 'sunday' | 'tuesday',
  games: Game[],
  players: Player[],
  picks: Record<string, PlayerPickData>,
  currentWeek: number = 2
): Promise<{
  subject: string;
  body: string;
  to: string;
  bccList: string[];
}> => {
  const activePlayers = players.filter(p => p.isActive !== false && (p as any).status !== 'inactive' && (p as any).active !== false);

  // Compute live scores and records strictly from TypeScript facts
  const standings = activePlayers.map(player => {
    const pData = picks[player.name];
    let wins = 0;
    let losses = 0;
    const finalGames = games.filter(g => g.status === 'final');

    finalGames.forEach(g => {
      const picked = pData?.picks[g.gameNumber];
      if (picked && g.officialWinner) {
        if (picked.toLowerCase().trim() === g.officialWinner.toLowerCase().trim()) {
          wins++;
        } else {
          losses++;
        }
      }
    });

    // Game 16 MNF pick & tiebreaker
    let mnfPick = pData?.picks[16] || '';
    if (!mnfPick && pData?.picks) {
      const allPicksValues = Object.values(pData.picks);
      if (allPicksValues.length > 0) {
        mnfPick = allPicksValues[allPicksValues.length - 1];
      }
    }
    if (!mnfPick) {
      mnfPick = '—';
    }

    const tb = pData?.tiebreaker !== undefined && pData?.tiebreaker !== '' ? pData.tiebreaker : '—';

    return {
      player,
      wins,
      losses,
      mnfPick,
      tiebreaker: tb
    };
  });

  // Calculate actual MNF points if Game 16 is final
  const mnfGame = games.find(g => g.isMNF);
  const mnfActualPoints = mnfGame && mnfGame.status === 'final'
    ? (mnfGame.awayScore || 0) + (mnfGame.homeScore || 0)
    : null;

  // Determine if there is a tie for first place rank
  const maxWins = standings.length > 0 ? Math.max(...standings.map(s => s.wins)) : 0;
  const tiedForFirst = standings.filter(s => s.wins === maxWins);

  let tiebreakerApplied = false;
  let tbWinnerName: string | null = null;
  let tbWinnerGuess: number | string = '—';
  let tbWinnerDiff: number | null = null;
  let tiedFirstNames: string[] = [];

  // Tiebreaker applies ONLY to a tie for first place rank when MNF is final
  // Awards 0 bonus points; scores remain pure wins and losses
  if (tiedForFirst.length > 1 && mnfActualPoints !== null) {
    tiedFirstNames = tiedForFirst.map(t => t.player.name);
    const withNumericTb = tiedForFirst.filter(t => typeof t.tiebreaker === 'number');
    if (withNumericTb.length > 0) {
      const minDiff = Math.min(...withNumericTb.map(t => Math.abs((t.tiebreaker as number) - mnfActualPoints)));
      const winner = withNumericTb.find(t => Math.abs((t.tiebreaker as number) - mnfActualPoints) === minDiff);
      if (winner) {
        tiebreakerApplied = true;
        tbWinnerName = winner.player.name;
        tbWinnerGuess = winner.tiebreaker;
        tbWinnerDiff = minDiff;
      }
    }
  }

  // Sort descending by wins; if tied for 1st place and tiebreaker applied, tiebreak winner takes 1st
  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.wins === maxWins && tiebreakerApplied) {
      if (a.player.name === tbWinnerName) return -1;
      if (b.player.name === tbWinnerName) return 1;
    }
    return a.player.name.localeCompare(b.player.name);
  });

  // Assign ranks (tiebreaker strictly breaks 1st place tie; other ties share rank)
  let currentRank = 1;
  const ranked = standings.map((item, index) => {
    if (index === 0) {
      currentRank = 1;
    } else {
      const prev = standings[index - 1];
      if (item.wins < prev.wins) {
        currentRank = index + 1;
      } else if (item.wins === prev.wins) {
        if (item.wins === maxWins && tiebreakerApplied && prev.player.name === tbWinnerName) {
          currentRank = index + 1;
        }
      }
    }
    return { ...item, rank: currentRank, isTiebreakWinner: item.player.name === tbWinnerName };
  });

  // Build clean text standings table
  const tableHeader = 
    `Rank  Contender             Wins  Losses  MNF Pick (Tiebreaker)\n` +
    `----------------------------------------------------------------`;
  const tableRows = ranked.map(r => {
    const rankStr = `#${r.rank}`.padEnd(6, ' ');
    const nameStr = r.player.name.padEnd(20, ' ');
    const winStr = `${r.wins}`.padStart(4, ' ');
    const lossStr = `${r.losses}`.padStart(7, ' ');
    const tbDisplay = r.tiebreaker !== undefined && r.tiebreaker !== '' ? `${r.tiebreaker}` : '--';
    const mnfStr = `   ${r.mnfPick} (${tbDisplay})`;
    return `${rankStr}${nameStr}${winStr}${lossStr}${mnfStr}`;
  }).join('\n');

  const standingsBlock = `\n${tableHeader}\n${tableRows}\n----------------------------------------------------------------\n`;

  // Email distribution list (all active contenders)
  const bccEmails = activePlayers
    .map(p => p.email)
    .filter(email => email && email.includes('@'));

  // ================================================================
  // STEP 1: MATHEMATICAL SCENARIO EVALUATION IN TYPESCRIPT
  // ================================================================
  const unplayedGames = games.filter(g => g.status !== 'final').length;
  const leader = ranked[0];
  const secondPlace = ranked[1];
  const leaderWins = leader?.wins ?? 0;
  const secondPlaceWins = secondPlace?.wins ?? 0;
  const leadMargin = leaderWins - secondPlaceWins;

  // - isClinched: (Leader's wins - 2nd place wins) > (Number of unplayed games remaining)
  const isClinched = leadMargin > unplayedGames;

  // - isLockedIn: Leader is ahead by 1 point AND (Leader's MNF pick === 2nd place's MNF pick)
  const isLockedIn = leadMargin === 1 && Boolean(
    leader && secondPlace &&
    leader.mnfPick && secondPlace.mnfPick &&
    leader.mnfPick !== '—' &&
    leader.mnfPick.toLowerCase().trim() === secondPlace.mnfPick.toLowerCase().trim()
  );

  // - isShowdown: Leader is ahead by 1 point AND (Leader's MNF pick !== 2nd place's MNF pick)
  const isShowdown = leadMargin === 1 && Boolean(
    leader && secondPlace &&
    leader.mnfPick && secondPlace.mnfPick &&
    leader.mnfPick !== '—' &&
    secondPlace.mnfPick !== '—' &&
    leader.mnfPick.toLowerCase().trim() !== secondPlace.mnfPick.toLowerCase().trim()
  );

  // - isTiebreaker: (After MNF is final) Multiple contenders tied for 1st place wins
  const isMnfFinal = mnfGame ? mnfGame.status === 'final' : games.every(g => g.status === 'final');
  const isTiebreaker = Boolean(isMnfFinal && tiedForFirst.length > 1);

  // ================================================================
  // STEP 2: CONNECT TO GEMINI API (@google/genai)
  // ================================================================
  const scenarioFacts: string[] = [
    `isClinched: ${isClinched} (Leader's margin of ${leadMargin} vs ${unplayedGames} unplayed games remaining)`,
    `isLockedIn: ${isLockedIn} (Leader is up by 1 point and matches 2nd place's MNF pick '${leader?.mnfPick}')`,
    `isShowdown: ${isShowdown} (Leader is up by 1 point, but picked '${leader?.mnfPick}' vs 2nd place's '${secondPlace?.mnfPick}')`,
    `isTiebreaker: ${isTiebreaker} (After MNF final, multiple contenders [${tiedFirstNames.join(', ')}] tied for 1st with ${maxWins} wins)`
  ];

  const savedConfig = getSavedPoolConfig();
  const leagueTitle = savedConfig.leagueName || 'Umpire Gear NFL Pool';
  const adminTitle = 'Admin';
  const adminName = savedConfig.adminName || 'Pool Admin';
  const adminEmail = savedConfig.adminEmail || 'admin@example.org';
  const crewChiefTitle = savedConfig.crewChiefTitle || 'Umpire-in-Chief';
  const crewChiefName = savedConfig.crewChiefName || adminName;

  const prompt = `
You are the ${crewChiefTitle} for the ${leagueTitle}.
Tone: Witty, sharp, sports-focused, and authoritative officiating voice.

CRITICAL PERSONA DIRECTIVE:
Core rule: Write completely original opening paragraphs every time. NEVER repeat boilerplate templates. Speak with the distinct voice of a seasoned league crew chief who loves straight-up picking and hates excuses.
NOTE ON THE FINE JAR: You may humorously cite contenders into the $1 Umpire Fine Jar for bad picking, cellar duty, or whining as classic pool ribbing.

CONTEXT & FACTS:
- Dispatch Type: ${type === 'friday' ? 'Friday Wire' : type === 'sunday' ? 'Sunday Night Roast' : 'Tuesday Morning Crown'}
- Current Week: ${currentWeek}
- Scenario Status:
${scenarioFacts.join('\n')}
- Current Leader: ${leader?.player.name || 'None'} with ${leaderWins} win(s)
- Second Place: ${secondPlace?.player.name || 'None'} with ${secondPlaceWins} win(s)
- Unplayed Games Remaining: ${unplayedGames}
- Live Standings Table:
${tableRows}

TASK:
Write 2 to 3 substantive, original, hilarious, and punchy opening paragraphs delivering this week's Crew Chief Recap for the ${type.toUpperCase()} dispatch.
Specifically incorporate the calculated facts:
${isClinched ? '• Highlight that the leader has officially CLINCHED the weekly victory because unplayed games cannot bridge the lead margin.' : ''}
${isLockedIn ? '• Highlight that the leader is LOCKED IN for the crown because they lead by 1 point and hold the identical Monday Night Football pick as 2nd place, mathematically sealing victory.' : ''}
${isShowdown ? '• Highlight the high-stakes SHOWDOWN on Monday Night: the leader is up by 1 point, but 1st and 2nd place hold OPPOSING picks on MNF, so the weekly crown hangs in the balance.' : ''}
${isTiebreaker ? '• Detail the exciting TIEBREAKER FINALE: multiple contenders finished tied for 1st place in wins, and the Monday Night tiebreaker total points rule determined the champion.' : ''}
${type === 'tuesday' ? `• Officially celebrate and crown ${leader?.player.name} as the Week ${currentWeek} champion!` : ''}
• Rib the cellar dwellers and chasing pack with good-natured umpire banter and honorary citations for the $1 Umpire Fine Jar.
• Return ONLY the narrative recap paragraphs. Do NOT include markdown code blocks, titles, or headers.
`;

  let aiRecap = '';
  try {
    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });
    } catch (e38: any) {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });
    }
    aiRecap = response.text ? response.text.trim() : '';
  } catch (err: any) {
    console.warn('[GmailService] Gemini API drafting notice, falling back to deterministic recap:', err?.message || err);
  }

  // ================================================================
  // STEP 3: DISPATCH PAYLOAD BUILDING WITH FALLBACK TEXT
  // ================================================================

  if (type === 'sunday') {
    const leaderDesc = leader ? `${leader.player.name} at ${leader.wins} wins` : 'our current leader';
    const chaserDesc = secondPlace ? `, with ${secondPlace.player.name} breathing right down their neck at ${secondPlace.wins} wins` : '';

    let scenarioNote = 'Everything rides on Monday Night Football.';
    if (isClinched) {
      scenarioNote = `With all unplayed games exhausted, ${leader?.player.name} has already CLINCHED the weekly summit outright!`;
    } else if (isLockedIn) {
      scenarioNote = `With both top contenders locked on the exact same Monday Night pick (${leader?.mnfPick}), ${leader?.player.name} has LOCKED IN the crown!`;
    } else if (isShowdown) {
      scenarioNote = `We have an epic SHOWDOWN brewing: ${leader?.player.name} (${leader?.mnfPick}) and ${secondPlace?.player.name} (${secondPlace?.mnfPick}) hold opposing picks on Monday Night!`;
    }

    const fallbackSundayRecap = 
`Well boys and girls, another glorious NFL Sunday is officially in the books for Week ${currentWeek}! Some of you made genius calls, and some of you picked like you were calling balls and strikes from the parking lot!

At the top of the mountain sits ${leaderDesc}${chaserDesc}. ${scenarioNote} Check the tiebreakers below and hold onto your hats!`;

    const crewChiefRecap = aiRecap || fallbackSundayRecap;
    const subject = `[NFL Pool 2026] Week ${currentWeek} Sunday Night Roast & Standings`;

    const body = 
`${leagueTitle}
WEEK ${currentWeek} SUNDAY NIGHT ROAST & STANDINGS DISPATCH
Dispatched: Sunday Evening • ${crewChiefTitle}: ${crewChiefName} • ${adminTitle}: ${adminName}

================================================================
CREW CHIEF RECAP: SUNDAY ACTION & LEAGUE ROAST
================================================================

${crewChiefRecap}

================================================================
GETTING STARTED & PICK RULES
================================================================

1. Select your name from the contender dropdown at the top to load your personal pick sheet.
2. Tap on "Weekly Picks" to review the schedule, select your winners straight-up, and enter your Monday Night tiebreaker total points.
3. Check the "Standings" and "Fine Jar" tabs to track citations and banter across the slate.

================================================================
CURRENT POOL STANDINGS (ENTERING MONDAY NIGHT FOOTBALL)
================================================================
${standingsBlock}
CREW CHIEF'S WORD OF WISDOM:
"If you took the points, you're in the wrong pool. Straight up only, baby! And remember: don't argue balls and strikes with the crew!" — ${crewChiefTitle}

--
${leagueTitle}
Automated Weekly Dispatch System`;

    return { subject, body, to: adminEmail, bccList: bccEmails };
  }

  if (type === 'tuesday') {
    const winner = ranked[0] || { player: { name: 'Winner' }, wins: 0, losses: 0 };
    const subject = `[NFL Pool 2026] Tuesday Morning Crown: ${winner.player.name} Wins Week ${currentWeek}${tiebreakerApplied ? ' (via MNF Tiebreaker)' : ''}!`;

    let championRecapParagraph = '';
    if (tiebreakerApplied && tbWinnerName) {
      const otherTied = tiedFirstNames.filter(n => n !== tbWinnerName);
      championRecapParagraph = 
`A massive tip of the championship cap to ${winner.player.name}, who wears the Week ${currentWeek} crown with ${winner.wins} wins!

★ OFFICIAL MONDAY NIGHT TIEBREAKER ACKNOWLEDGEMENT:
With a deadlock atop the leaderboard at ${winner.wins} wins between ${tiedFirstNames.join(' and ')}, the Monday Night Football tiebreaker rule was invoked strictly for 1st place rank. ${winner.player.name} predicted ${tbWinnerGuess} combined total points (actual MNF score: ${mnfActualPoints} points, margin of error: ${tbWinnerDiff} pts), edging out ${otherTied.join(', ')} for the weekly crown!
Per pool rules: Contenders receive 0 bonus points for winning the tiebreaker. All contender scores remain strictly consistent with actual wins and losses (${winner.wins}-${winner.losses}), with the tiebreaker serving solely to determine the weekly crown and Tuesday dispatch champion acknowledgement.`;
    } else {
      championRecapParagraph = 
`A massive tip of the championship cap to ${winner.player.name}, who outright survives the gauntlet to wear the Week ${currentWeek} crown with ${winner.wins} wins (${winner.wins}-${winner.losses}) and claim the spoils!`;
    }

    const fallbackTuesdayRecap = 
`The dust has finally settled on Week ${currentWeek} after an electric Monday Night collision! Tiebreaker calculators were smoking, and the ${leagueTitle} officially crowns another weekly commander. When that final whistle blew, the contenders were separated from the pretenders in true umpire fashion, proving once again that straight-up picking is the ultimate test of courage.

${championRecapParagraph}

For those of you currently camping in the cellar—take heart: the season is young, the slate wipes clean on Wednesday, and your redemption is only 16 picks away for Week ${currentWeek + 1}!`;

    const crewChiefRecap = aiRecap || fallbackTuesdayRecap;

    const body = 
`${leagueTitle}
WEEK ${currentWeek} TUESDAY MORNING CROWN & FINAL STANDINGS
Dispatched: Tuesday Morning • ${crewChiefTitle}: ${crewChiefName} • ${adminTitle}: ${adminName}

================================================================
CREW CHIEF RECAP: THE DUST SETTLES & THE CROWN FINDS A HEAD
================================================================

${crewChiefRecap}

================================================================
FINAL WEEK ${currentWeek} STANDINGS & SCORES
================================================================
${standingsBlock}
POOL RULE REMINDER:
• Straight-up picks only (1 point per win, 0 points per loss).
• Monday Night tiebreaker applies solely to resolve a tie for 1st place rank.
• 0 points or half points are awarded for tiebreakers; all scores strictly reflect actual wins and losses.
• The $1 Umpire Fine Jar is reserved for classic pool infractions and good-natured ribbing.

CREW CHIEF'S WORD OF WISDOM:
"A champion eats steak on Tuesday; the rest of you can split the leftover hot dogs from the snack shack. Week ${currentWeek + 1} sheets hit the wire on Wednesday—don't be late!" — ${crewChiefTitle}

--
${leagueTitle}
Automated Weekly Dispatch System`;

    return { subject, body, to: adminEmail, bccList: bccEmails };
  }

  // Friday Wire
  const subject = `[NFL Pool 2026] The Friday Wire: Week ${currentWeek} Kickoff Notice & Lock Reminders`;
  const fallbackFridayRecap = 
`Good evening contenders! The Week ${currentWeek} weekend slate is officially upon us. All straight-up picks for Sunday's games must be finalized before the 10:00 AM PST early kickoff.

INJURY & NOTEWIRE:
• Check kickoff times and injury reports before locking your selections.
• Make sure your Monday Night Tiebreaker total points guess is filled out!
• Check the $1 Umpire Fine Jar to see who got cited for bad picking or cellar duty!`;

  const crewChiefRecap = aiRecap || fallbackFridayRecap;

  const body = 
`${leagueTitle}
WEEK ${currentWeek} FRIDAY WIRE & INJURY DOSSIER
Dispatched: Friday Evening • ${crewChiefTitle}: ${crewChiefName} • ${adminTitle}: ${adminName}

================================================================
CREW CHIEF RECAP: STRAIGHT-UP PICKS LOCKED & LOADED
================================================================

${crewChiefRecap}

ROSTER DISTRIBUTION CHECKLIST:
${activePlayers.map(p => `✓ ${p.name.padEnd(20, ' ')} (${p.email})`).join('\n')}

CREW CHIEF'S WORD OF WISDOM:
"Always trust your gut on Thursday, but sleep on your Sunday picks. And remember: straight up only—we don't do spreads in this house!" — ${crewChiefTitle}

--
${leagueTitle}
Automated Weekly Dispatch System`;

  return { subject, body, to: adminEmail, bccList: bccEmails };
};
