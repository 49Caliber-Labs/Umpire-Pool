import { Game, StandingsRow } from '../types';

/**
 * NFL Tie Engine
 * Complete, authoritative handling for NFL game ties across:
 * - Live scoring ingestion
 * - Straight-up pick grading
 * - Translucent light-blue visual presentation on pick sheets and master board
 * - Certified season standings and W-L-T record formatting
 */

export type PickOutcome = 
  | 'WIN' 
  | 'LOSS' 
  | 'TIE' 
  | 'LIVE_LEAD' 
  | 'LIVE_TRAIL' 
  | 'LIVE_TIED' 
  | 'PENDING';

/**
 * Determines whether a game has completed in an official NFL tie.
 */
export function isGameTie(game: Partial<Game> | undefined | null): boolean {
  if (!game) return false;
  if (game.isTie === true) return true;
  if (game.officialWinner === 'TIE' || game.officialWinner === 'Push' || game.officialWinner === 'TIE / Push') return true;
  if (
    game.status === 'final' &&
    typeof game.awayScore === 'number' &&
    typeof game.homeScore === 'number' &&
    game.awayScore === game.homeScore
  ) {
    return true;
  }
  return false;
}

/**
 * Determines whether a game is currently underway and deadlocked.
 */
export function isGameLiveTied(game: Partial<Game> | undefined | null): boolean {
  if (!game) return false;
  return (
    game.status === 'in_progress' &&
    typeof game.awayScore === 'number' &&
    typeof game.homeScore === 'number' &&
    game.awayScore === game.homeScore
  );
}

/**
 * Pure evaluator for an individual contender pick against a game state.
 */
export function evaluatePickOutcome(pick: string | undefined | null, game: Game): PickOutcome {
  if (!pick) return 'PENDING';

  // 1. Final Tie Game (Push)
  if (isGameTie(game)) {
    return 'TIE';
  }

  // 2. Final Game with Decisive Winner
  if (game.status === 'final') {
    if (game.officialWinner && game.officialWinner !== 'TIE') {
      return pick.trim().toLowerCase() === game.officialWinner.trim().toLowerCase() ? 'WIN' : 'LOSS';
    }
    // Fallback if officialWinner was omitted but scores exist
    if (typeof game.awayScore === 'number' && typeof game.homeScore === 'number') {
      if (game.awayScore > game.homeScore) {
        return pick.trim().toLowerCase() === game.awayTeam.trim().toLowerCase() ? 'WIN' : 'LOSS';
      }
      if (game.homeScore > game.awayScore) {
        return pick.trim().toLowerCase() === game.homeTeam.trim().toLowerCase() ? 'WIN' : 'LOSS';
      }
      return 'TIE';
    }
    return 'PENDING';
  }

  // 3. Live Game in Progress
  if (game.status === 'in_progress') {
    if (typeof game.awayScore === 'number' && typeof game.homeScore === 'number') {
      const pickLower = pick.trim().toLowerCase();
      const awayLower = game.awayTeam.trim().toLowerCase();
      const homeLower = game.homeTeam.trim().toLowerCase();

      if (game.awayScore > game.homeScore) {
        if (pickLower === awayLower) return 'LIVE_LEAD';
        if (pickLower === homeLower) return 'LIVE_TRAIL';
      } else if (game.homeScore > game.awayScore) {
        if (pickLower === homeLower) return 'LIVE_LEAD';
        if (pickLower === awayLower) return 'LIVE_TRAIL';
      } else {
        return 'LIVE_TIED';
      }
    }
    return 'PENDING';
  }

  return 'PENDING';
}

/**
 * Translucent Light Blue theme constants for tied games
 * Applied globally and dynamically across all pick sheets, leaderboards, and tabs.
 */
export const TIE_THEME = {
  // Translucent light blue styling for pick cells and team pick columns
  cellBackground: 'bg-sky-100/75 text-sky-950 font-bold border-sky-300 ring-1 ring-sky-300/60 shadow-2xs',
  winnerBadge: 'bg-sky-100/90 text-sky-950 border border-sky-300 font-bold shadow-2xs',
  liveTiedCell: 'bg-sky-50/80 text-sky-900 font-semibold border-sky-200',
  columnHeader: 'bg-sky-800/80 text-sky-100 border-sky-500 ring-1 ring-sky-400/50 backdrop-blur-xs',
  columnHeaderSub: 'bg-sky-950/80 text-sky-200 border-sky-600',
  teamButton: 'bg-sky-100/90 text-sky-950 border-sky-400 font-bold opacity-95 ring-1 ring-sky-300',
  labelText: '⚖️ TIE (Push - 0 Pts)',
  straightUpRuleText: 'Straight Up: Nobody won, nobody lost (0 Pts / Push)',
  symbol: '⚖️'
} as const;

/**
 * Computes weekly score breakdown for a contender, with full tie support.
 */
export function calculateContenderWeekScore(
  playerPicks: Record<number, string>,
  games: Game[]
): {
  wins: number;
  losses: number;
  ties: number;
  liveWins: number;
  liveLosses: number;
  liveTies: number;
  totalScore: number;
} {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let liveWins = 0;
  let liveLosses = 0;
  let liveTies = 0;

  games.forEach(game => {
    const pick = playerPicks[game.gameNumber];
    const outcome = evaluatePickOutcome(pick, game);

    switch (outcome) {
      case 'WIN':
        wins++;
        break;
      case 'LOSS':
        losses++;
        break;
      case 'TIE':
        ties++;
        break;
      case 'LIVE_LEAD':
        liveWins++;
        break;
      case 'LIVE_TRAIL':
        liveLosses++;
        break;
      case 'LIVE_TIED':
        liveTies++;
        break;
      case 'PENDING':
      default:
        break;
    }
  });

  return {
    wins,
    losses,
    ties,
    liveWins,
    liveLosses,
    liveTies,
    totalScore: wins // Straight-up points awarded for outright wins
  };
}

/**
 * Formats a record string: W-L or W-L-T when ties exist.
 */
export function formatRecord(wins: number, losses: number, ties?: number): string {
  if (typeof ties === 'number' && ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }
  return `${wins}-${losses}`;
}

/**
 * Mutates or clones a game object into a certified final tie.
 */
export function markGameAsFinalTie(game: Game, score: number = 20): Game {
  return {
    ...game,
    awayScore: game.awayScore !== undefined ? game.awayScore : score,
    homeScore: game.homeScore !== undefined ? game.homeScore : score,
    officialWinner: 'TIE',
    isTie: true,
    status: 'final',
    quarter: 'FINAL/OT',
    clock: '0:00',
    lastUpdated: new Date().toISOString()
  };
}
