import { Game } from '../types';

const ESPN_NFL_SCOREBOARD_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export interface SyncResult {
  updatedGames: Game[];
  liveCount: number;
  finalCount: number;
  scheduledCount: number;
  changedCount: number;
  lastSyncTime: string;
  source: 'espn_live' | 'simulation' | 'cached';
  error?: string;
}

// Normalized team dictionary helper for reliable matching
const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

const TEAM_MAP: Record<string, { city: string; names: string[]; abbrevs: string[] }> = {
  'New England': { city: 'new england', names: ['patriots', 'new england'], abbrevs: ['ne'] },
  'Seattle': { city: 'seattle', names: ['seahawks', 'seattle'], abbrevs: ['sea'] },
  'San Francisco': { city: 'san francisco', names: ['49ers', 'niners', 'san francisco'], abbrevs: ['sf'] },
  'Los Angeles (Rams)': { city: 'los angeles', names: ['rams', 'la rams'], abbrevs: ['lar'] },
  'Los Angeles (Chargers)': { city: 'los angeles', names: ['chargers', 'la chargers'], abbrevs: ['lac'] },
  'Chicago': { city: 'chicago', names: ['bears', 'chicago'], abbrevs: ['chi'] },
  'Carolina': { city: 'carolina', names: ['panthers', 'carolina'], abbrevs: ['car'] },
  'Baltimore': { city: 'baltimore', names: ['ravens', 'baltimore'], abbrevs: ['bal'] },
  'Indianapolis': { city: 'indianapolis', names: ['colts', 'indianapolis', 'indy'], abbrevs: ['ind'] },
  'Tampa Bay': { city: 'tampa bay', names: ['buccaneers', 'bucs', 'tampa'], abbrevs: ['tb'] },
  'Cincinnati': { city: 'cincinnati', names: ['bengals', 'cincinnati', 'cincy'], abbrevs: ['cin'] },
  'Atlanta': { city: 'atlanta', names: ['falcons', 'atlanta'], abbrevs: ['atl'] },
  'Pittsburgh': { city: 'pittsburgh', names: ['steelers', 'pittsburgh'], abbrevs: ['pit'] },
  'New York (Jets)': { city: 'new york', names: ['jets', 'ny jets'], abbrevs: ['nyj'] },
  'New York (Giants)': { city: 'new york', names: ['giants', 'ny giants'], abbrevs: ['nyg'] },
  'Tennessee': { city: 'tennessee', names: ['titans', 'tennessee'], abbrevs: ['ten'] },
  'New Orleans': { city: 'new orleans', names: ['saints', 'new orleans'], abbrevs: ['no'] },
  'Detroit': { city: 'detroit', names: ['lions', 'detroit'], abbrevs: ['det'] },
  'Buffalo': { city: 'buffalo', names: ['bills', 'buffalo'], abbrevs: ['buf'] },
  'Houston': { city: 'houston', names: ['texans', 'houston'], abbrevs: ['hou'] },
  'Cleveland': { city: 'cleveland', names: ['browns', 'cleveland'], abbrevs: ['cle'] },
  'Jacksonville': { city: 'jacksonville', names: ['jaguars', 'jags', 'jacksonville'], abbrevs: ['jax'] },
  'Arizona': { city: 'arizona', names: ['cardinals', 'arizona', 'cards'], abbrevs: ['ari'] },
  'Green Bay': { city: 'green bay', names: ['packers', 'green bay'], abbrevs: ['gb'] },
  'Minnesota': { city: 'minnesota', names: ['vikings', 'minnesota'], abbrevs: ['min'] },
  'Miami': { city: 'miami', names: ['dolphins', 'miami'], abbrevs: ['mia'] },
  'Las Vegas': { city: 'las vegas', names: ['raiders', 'las vegas', 'vegas'], abbrevs: ['lv', 'oak'] },
  'Washington': { city: 'washington', names: ['commanders', 'washington'], abbrevs: ['wsh', 'was'] },
  'Philadelphia': { city: 'philadelphia', names: ['eagles', 'philadelphia', 'philly'], abbrevs: ['phi'] },
  'Dallas': { city: 'dallas', names: ['cowboys', 'dallas'], abbrevs: ['dal'] },
  'Denver': { city: 'denver', names: ['broncos', 'denver'], abbrevs: ['den'] },
  'Kansas City': { city: 'kansas city', names: ['chiefs', 'kansas city'], abbrevs: ['kc'] },
};

function matchCompetitor(teamString: string, gameNumber: number, isHome: boolean, competitor: any): boolean {
  if (!competitor || !competitor.team) return false;
  const disp = normalize(competitor.team.displayName || '');
  const loc = normalize(competitor.team.location || '');
  const name = normalize(competitor.team.name || '');
  const abbrev = (competitor.team.abbreviation || '').toLowerCase();

  const entry = TEAM_MAP[teamString];
  if (entry) {
    if (entry.abbrevs.includes(abbrev)) return true;
    for (const n of entry.names) {
      if (disp.includes(n) || name.includes(n)) return true;
    }
    // Location match only if not ambiguous cities like NY or LA
    if (loc.includes(entry.city) && !teamString.includes('(') && !entry.city.includes('york') && !entry.city.includes('los angeles')) {
      return true;
    }
  }

  // Special disambiguations for LA & NY in legacy representations
  if (teamString.includes('Jets') || (teamString === 'New York' && gameNumber === 7)) {
    return disp.includes('jets') || abbrev === 'nyj';
  }
  if (teamString.includes('Giants') || (teamString === 'New York' && (gameNumber === 15 || gameNumber === 16))) {
    return disp.includes('giants') || abbrev === 'nyg';
  }
  if (teamString.includes('Chargers') || (teamString === 'Los Angeles' && gameNumber === 11)) {
    return disp.includes('chargers') || abbrev === 'lac';
  }
  if (teamString.includes('Rams') || (teamString === 'Los Angeles' && (gameNumber === 2 || gameNumber === 16))) {
    return disp.includes('rams') || abbrev === 'lar';
  }

  const normTarget = normalize(teamString);
  return (
    disp.includes(normTarget) ||
    loc.includes(normTarget) ||
    name.includes(normTarget) ||
    normTarget.includes(loc) ||
    normTarget.includes(name)
  );
}

/**
 * Fetch real-time live scores from ESPN NFL API
 */
export async function fetchLiveNFLScores(currentGames: Game[]): Promise<SyncResult> {
  try {
    const res = await fetch(ESPN_NFL_SCOREBOARD_URL, {
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!res.ok) {
      throw new Error(`ESPN API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const events: any[] = data.events || [];

    if (!events.length) {
      throw new Error('No NFL events found in ESPN response');
    }

    let changedCount = 0;

    const updatedGames: Game[] = currentGames.map(game => {
      // Find matching ESPN event
      const matchedEvent = events.find(event => {
        const comp = event.competitions?.[0];
        if (!comp) return false;
        const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
        const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
        
        const awayMatches = matchCompetitor(game.awayTeam, game.gameNumber, false, away);
        const homeMatches = matchCompetitor(game.homeTeam, game.gameNumber, true, home);
        return awayMatches && homeMatches;
      });

      if (!matchedEvent) {
        return game;
      }

      const comp = matchedEvent.competitions?.[0];
      const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
      const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
      const eventStatus = matchedEvent.status;
      const state = eventStatus?.type?.state; // 'pre', 'in', 'post'

      const awayScore = away?.score !== undefined ? Number(away.score) : game.awayScore;
      const homeScore = home?.score !== undefined ? Number(home.score) : game.homeScore;

      let newStatus: 'scheduled' | 'in_progress' | 'final' = 'scheduled';
      let officialWinner = game.officialWinner;
      let quarter = game.quarter;
      let clock = eventStatus?.displayClock || game.clock;
      const statusDetail = eventStatus?.type?.detail || '';

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
        officialWinner = null;
        const period = eventStatus?.period;
        if (eventStatus?.type?.name === 'STATUS_HALFTIME') {
          quarter = 'HALF';
        } else if (period === 1) quarter = '1Q';
        else if (period === 2) quarter = '2Q';
        else if (period === 3) quarter = '3Q';
        else if (period === 4) quarter = '4Q';
        else if (period > 4) quarter = 'OT';
      } else {
        newStatus = 'scheduled';
      }

      // Check situation (possession, red zone, last play)
      let possession: string | undefined = undefined;
      let downDistance: string | undefined = undefined;
      let redzone: boolean | undefined = undefined;
      let lastPlay: string | undefined = undefined;

      if (comp?.situation) {
        const sit = comp.situation;
        redzone = Boolean(sit.isRedZone);
        if (sit.downDistanceText) {
          downDistance = sit.downDistanceText;
        } else if (sit.down > 0 && sit.distance > 0) {
          downDistance = `${sit.down}${getOrdinalSuffix(sit.down)} & ${sit.distance}`;
        }

        if (sit.possession) {
          if (sit.possession === away?.team?.id) possession = game.awayTeam;
          else if (sit.possession === home?.team?.id) possession = game.homeTeam;
        }

        if (sit.lastPlay?.text) {
          lastPlay = sit.lastPlay.text;
        }
      }

      const hasChanged = 
        game.status !== newStatus ||
        game.awayScore !== awayScore ||
        game.homeScore !== homeScore ||
        game.officialWinner !== officialWinner ||
        game.clock !== clock ||
        game.quarter !== quarter;

      if (hasChanged) {
        changedCount++;
      }

      return {
        ...game,
        status: newStatus,
        awayScore,
        homeScore,
        officialWinner,
        quarter,
        clock,
        statusDetail,
        possession,
        downDistance,
        redzone,
        lastPlay,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    });

    const liveCount = updatedGames.filter(g => g.status === 'in_progress').length;
    const finalCount = updatedGames.filter(g => g.status === 'final').length;
    const scheduledCount = updatedGames.filter(g => g.status === 'scheduled').length;

    return {
      updatedGames,
      liveCount,
      finalCount,
      scheduledCount,
      changedCount,
      lastSyncTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      source: 'espn_live'
    };
  } catch (err: any) {
    console.warn('[LiveScoringService] Score sync error:', err.message);
    return {
      updatedGames: currentGames,
      liveCount: currentGames.filter(g => g.status === 'in_progress').length,
      finalCount: currentGames.filter(g => g.status === 'final').length,
      scheduledCount: currentGames.filter(g => g.status === 'scheduled').length,
      changedCount: 0,
      lastSyncTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      source: 'cached',
      error: err.message
    };
  }
}

function getOrdinalSuffix(i: number): string {
  const j = i % 10;
  const k = i % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

/**
 * Broadcast games across browser tabs using BroadcastChannel
 */
export function broadcastGames(games: Game[]): void {
  try {
    localStorage.setItem('nfl_pool_games_v4', JSON.stringify(games));
    localStorage.setItem('nfl_pool_games_v3', JSON.stringify(games));
    localStorage.setItem('nfl_pool_games_v2', JSON.stringify(games));
    localStorage.setItem('nfl_pool_games_v1', JSON.stringify(games));
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const ch = new BroadcastChannel('nfl_pool_games_channel');
      ch.postMessage({ type: 'GAMES_UPDATED', games });
      ch.close();
    }
  } catch (e) {
    console.error('Failed to broadcast games:', e);
  }
}

/**
 * Game Day Live Simulator for Testing & Demonstrations
 * Advances in-progress games, adds random touchdowns/field goals, updates clocks
 */
export function advanceSimulationStep(currentGames: Game[]): { games: Game[]; note: string } {
  let simulatedChange = false;
  let eventNote = '';

  const updated = currentGames.map(game => {
    // If game is in_progress, update clock and score occasionally
    if (game.status === 'in_progress') {
      simulatedChange = true;
      const isAwayScore = Math.random() > 0.5;
      const points = Math.random() > 0.4 ? 7 : 3;
      const newAway = isAwayScore ? (game.awayScore || 0) + points : (game.awayScore || 0);
      const newHome = !isAwayScore ? (game.homeScore || 0) + points : (game.homeScore || 0);
      const scoringTeam = isAwayScore ? game.awayTeam : game.homeTeam;
      eventNote = `⚡ Score update in Game ${game.gameNumber}: ${scoringTeam} +${points}! (${newAway}-${newHome})`;

      return {
        ...game,
        awayScore: newAway,
        homeScore: newHome,
        quarter: '4Q',
        clock: '2:15',
        lastPlay: `${scoringTeam} ${points === 7 ? 'Touchdown pass' : '42-yd Field Goal'}!`,
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    }

    // If game 16 is scheduled and user wants to simulate live MNF action
    if (game.gameNumber === 16 && game.status === 'scheduled') {
      simulatedChange = true;
      eventNote = `⚡ Game 16 (Denver @ Kansas City) kicked off and is LIVE!`;
      return {
        ...game,
        status: 'in_progress' as const,
        awayScore: 7,
        homeScore: 10,
        quarter: '2Q',
        clock: '4:18',
        statusDetail: '4:18 - 2nd Quarter',
        lastPlay: 'Chiefs 12-yd touchdown pass!',
        lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
    }

    return game;
  });

  if (!simulatedChange) {
    // Only simulate live action for games that are not already finalized
    const nonFinal = currentGames.find(g => g.status === 'in_progress' || g.status === 'scheduled');
    if (nonFinal) {
      return {
        games: currentGames.map(g => g.gameNumber === nonFinal.gameNumber ? {
          ...g,
          status: 'in_progress' as const,
          awayScore: g.awayScore || 7,
          homeScore: g.homeScore || 10,
          quarter: '2Q',
          clock: '4:18',
          statusDetail: '4:18 - 2nd Quarter',
          lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        } : g),
        note: `Started live simulation for Game ${nonFinal.gameNumber}!`
      };
    }
  }

  return { games: updated, note: eventNote };
}
