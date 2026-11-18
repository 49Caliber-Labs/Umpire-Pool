import { Game } from '../types';

export type LeaguePhase = 
  | 'PRE_WEEK'      // 0 games kicked off
  | 'TNF_LIVE'      // Thursday Night game is live
  | 'TNF_FINAL'     // TNF is final (Triggers Friday Night Wire)
  | 'SUNDAY_LIVE'   // Sunday slate is underway
  | 'SNF_FINAL'     // Sunday night game is final (Triggers Sunday Night Recap)
  | 'MNF_LIVE'      // Monday night game is underway
  | 'MNF_FINAL'     // All 16 games final (Triggers Tuesday Final & Standings Freeze)
  | 'WEEK_FROZEN';  // Standings frozen & archived

export interface LeaguePulse {
  phase: LeaguePhase;
  phaseLabel: string;
  phaseDescription: string;
  currentWeek: number;
  totalGames: number;
  finalGames: number;
  liveGames: number;
  pendingGames: number;
  allGamesFinal: boolean;
  hasTNF: boolean;
  tnfFinal: boolean;
  snfFinal: boolean;
  mnfFinal: boolean;
  recommendedDispatch: 'friday' | 'sunday' | 'tuesday' | null;
  canAdvanceWeek: boolean;
}

/**
 * Pure evaluator for the Official League Clock.
 * Decoupled: does NOT mutate state, touch database, or write picks.
 */
export function evaluateLeaguePulse(games: Game[]): LeaguePulse {
  const totalGames = games.length;
  if (totalGames === 0) {
    return {
      phase: 'PRE_WEEK',
      phaseLabel: 'Pre-Kickoff',
      phaseDescription: 'Picks open for all matchups',
      currentWeek: 4,
      totalGames: 0,
      finalGames: 0,
      liveGames: 0,
      pendingGames: 0,
      allGamesFinal: false,
      hasTNF: false,
      tnfFinal: false,
      snfFinal: false,
      mnfFinal: false,
      recommendedDispatch: null,
      canAdvanceWeek: false
    };
  }

  const currentWeek = games.find(g => typeof g.week === 'number' && g.week > 0)?.week || games[0]?.week || 4;
  const finalGames = games.filter(g => g.status === 'final').length;
  const liveGames = games.filter(g => g.status === 'in_progress').length;
  const pendingGames = games.filter(g => g.status === 'scheduled' || !g.status).length;
  const allGamesFinal = finalGames === totalGames && totalGames > 0;

  // Identify special marquee games
  const tnfGame = games.find(g => g.isTNF || (g.day && g.day.toLowerCase().includes('thu')) || (g.kickoffTime && g.kickoffTime.toLowerCase().includes('thu')));
  const snfGame = games.find(g => g.isSNF || (g.day && g.day.toLowerCase().includes('sun night')) || (g.kickoffTime && g.kickoffTime.toLowerCase().includes('sun night')));
  const mnfGame = games.find(g => g.isMNF || (g.day && g.day.toLowerCase().includes('mon')) || (g.kickoffTime && g.kickoffTime.toLowerCase().includes('mon')));

  const tnfFinal = tnfGame?.status === 'final';
  const tnfLive = tnfGame?.status === 'in_progress';
  const snfFinal = snfGame?.status === 'final';
  const mnfFinal = mnfGame?.status === 'final' || allGamesFinal;
  const mnfLive = mnfGame?.status === 'in_progress';

  let phase: LeaguePhase = 'PRE_WEEK';
  let phaseLabel = 'Pre-Kickoff';
  let phaseDescription = 'All sheets open for contender picks';
  let recommendedDispatch: 'friday' | 'sunday' | 'tuesday' | null = null;

  if (allGamesFinal) {
    phase = 'MNF_FINAL';
    phaseLabel = 'Week Complete';
    phaseDescription = `All ${totalGames} games complete. Standings finalized and certified.`;
    recommendedDispatch = 'tuesday';
  } else if (mnfLive) {
    phase = 'MNF_LIVE';
    phaseLabel = 'Monday Night Football Live';
    phaseDescription = 'Final primetime matchup underway. Tiebreaker points deciding the crown.';
  } else if (snfFinal || (finalGames === totalGames - 1 && !mnfFinal)) {
    phase = 'SNF_FINAL';
    phaseLabel = 'Sunday Slate Final';
    phaseDescription = `${finalGames} of ${totalGames} games final. Monday Night decider pending.`;
    recommendedDispatch = 'sunday';
  } else if (liveGames > 0) {
    phase = 'SUNDAY_LIVE';
    phaseLabel = 'NFL Action Live';
    phaseDescription = `${liveGames} live game${liveGames > 1 ? 's' : ''} in progress • ${finalGames}/${totalGames} final`;
  } else if (tnfFinal) {
    phase = 'TNF_FINAL';
    phaseLabel = 'Thursday Opener Final';
    phaseDescription = `Thursday opener in the books • ${finalGames}/${totalGames} final`;
    recommendedDispatch = 'friday';
  } else if (tnfLive) {
    phase = 'TNF_LIVE';
    phaseLabel = 'Thursday Night Opener Live';
    phaseDescription = 'Thursday opener in progress. Remaining games pending.';
  }

  return {
    phase,
    phaseLabel,
    phaseDescription,
    currentWeek,
    totalGames,
    finalGames,
    liveGames,
    pendingGames,
    allGamesFinal,
    hasTNF: Boolean(tnfGame),
    tnfFinal,
    snfFinal,
    mnfFinal,
    recommendedDispatch,
    canAdvanceWeek: allGamesFinal || finalGames >= 15
  };
}
