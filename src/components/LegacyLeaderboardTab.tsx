import React, { useState, useMemo, useEffect, memo } from 'react';
import { 
  Trophy, 
  Crown, 
  FileSpreadsheet, 
  LayoutList, 
  Check, 
  X, 
  Calendar, 
  Award, 
  ChevronDown, 
  ChevronUp,
  Printer,
  Download
} from 'lucide-react';
import { Game, Player, PlayerPickData, StandingsRow, SeasonHistory } from '../types';
import { LegacyPickSheetViewer } from './LegacyPickSheetViewer';
import { evaluateLeaguePulse } from '../services/leagueClockService';
import { isAdminPinUnlocked } from '../utils/adminAuth';
import { isGameTie, isGameLiveTied } from '../utils/nflTieEngine';
import { PoolSetupConfig, DEFAULT_POOL_CONFIG } from '../config/leagueConfig';

interface LegacyLeaderboardTabProps {
  games: Game[];
  players: Player[];
  picks: Record<string, PlayerPickData>;
  activePlayer?: Player | null;
  onSelectPlayerForPicks?: (player: Player) => void;
  showLiveScores?: boolean;
  onToggleLiveScores?: () => void;
  onSyncLiveScores?: () => void;
  isSyncingScores?: boolean;
  lastScoreSyncTime?: string;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
  seasonHistory?: SeasonHistory;
  onCompileWeekResults?: (weekNumber?: number) => Promise<{ success: boolean; winnerName?: string }>;
  onAdvanceWeekSafely?: (weekNumber?: number) => Promise<{ success: boolean; nextWeek?: number; winnerName?: string; error?: string }>;
  isCompactMode?: boolean;
  poolConfig?: PoolSetupConfig;
}

export const LegacyLeaderboardTab: React.FC<LegacyLeaderboardTabProps> = memo(({
  games,
  players,
  picks,
  activePlayer,
  onSelectPlayerForPicks,
  showLiveScores = false,
  onToggleLiveScores,
  onSyncLiveScores,
  isSyncingScores = false,
  lastScoreSyncTime,
  autoSyncEnabled = true,
  onToggleAutoSync,
  seasonHistory,
  onCompileWeekResults,
  onAdvanceWeekSafely,
  isCompactMode = false,
  poolConfig = DEFAULT_POOL_CONFIG
}) => {
  const [viewMode, setViewMode] = useState<'vintage' | 'cards' | 'sheets' | 'season'>('vintage');
  const [leaderScope, setLeaderScope] = useState<'week' | 'season'>('week');
  const [sortBy, setSortBy] = useState<string>('week');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'leaders'>('all');
  const [rankBy, setRankBy] = useState<'final' | 'projected'>('final');
  const [isPodiumCollapsed, setIsPodiumCollapsed] = useState<boolean>(() => isCompactMode);
  const [showAllWeeks, setShowAllWeeks] = useState<boolean>(false);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  // Live Digital Clock State with Timezone & DST
  const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDigitalClock = useMemo(() => {
    try {
      const dateStr = currentDateTime.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const timeStr = currentDateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
      return `${dateStr} • ${timeStr}`;
    } catch (e) {
      return currentDateTime.toLocaleString();
    }
  }, [currentDateTime]);

  // Clean Landscape Print for the Scoring Matrix
  const handlePrintMatrix = () => {
    const prevTitle = document.title;
    document.title = `Week ${currentActiveWeek} Scoring Spreadsheet`;
    document.body.classList.remove('print-portrait');
    document.body.classList.add('print-bw');
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
      document.body.classList.remove('print-bw');
    }, 1000);
  };

  // Export full live matrix to CSV
  const handleExportCsv = () => {
    const headers = [
      'Rank',
      'Contender',
      'Role',
      'Week Wins',
      'Week Losses',
      ...games.map(g => `G${g.gameNumber} (${g.awayTeam} @ ${g.homeTeam})`),
      'Tiebreaker',
      'Season Wins'
    ];
    const rows: string[][] = [];

    filteredStandings.forEach((st) => {
      const pPicks = picks[st.name]?.picks || {};
      const player = players.find(p => p.name === st.name);
      const role = player?.role || 'player';
      const seasonWins = seasonHistory?.records?.[st.name]?.totalWins ?? st.wins;

      const row = [
        String(st.rank),
        `"${st.name}"`,
        role,
        String(st.wins),
        String(st.losses),
        ...games.map(g => `"${pPicks[g.gameNumber] || ''}"`),
        String(st.tbPrediction ?? ''),
        String(seasonWins)
      ];
      rows.push(row);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Week_${currentActiveWeek}_Scoring_Spreadsheet.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Decoupled Official League Clock Evaluator
  const pulse = useMemo(() => evaluateLeaguePulse(games), [games]);

  // Determine latest compiled week and current reigning weekly winner (0 when pool is in its debut week)
  const latestCompiledWeek = seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0
    ? Math.max(...seasonHistory.compiledWeeks)
    : 0;

  let currentWeeklyWinnerName: string | null = null;
  if (seasonHistory?.records) {
    for (const [name, rec] of Object.entries(seasonHistory.records) as [string, any][]) {
      if (rec?.weeklyBreakdown?.[latestCompiledWeek]?.isWinner) {
        currentWeeklyWinnerName = name;
        break;
      }
    }
    if (!currentWeeklyWinnerName) {
      let maxWins = -1;
      for (const [name, rec] of Object.entries(seasonHistory.records) as [string, any][]) {
        const wWins = rec?.weeklyBreakdown?.[latestCompiledWeek]?.wins ?? -1;
        if (wWins > maxWins) {
          maxWins = wWins;
          currentWeeklyWinnerName = name;
        }
      }
    }
  }

  // Map of weekly winners for each compiled week to highlight their scoring blocks
  const weeklyWinnersByWeek = useMemo(() => {
    const map: Record<number, Set<string>> = {};
    if (seasonHistory?.records) {
      // 1. Check explicit isWinner flags from weekly breakdowns
      for (const [name, rec] of Object.entries(seasonHistory.records) as [string, any][]) {
        if (rec?.weeklyBreakdown) {
          for (const [wkStr, b] of Object.entries(rec.weeklyBreakdown) as [string, any][]) {
            const wNum = parseInt(wkStr, 10);
            if (!isNaN(wNum) && b?.isWinner) {
              if (!map[wNum]) map[wNum] = new Set();
              map[wNum].add(name);
            }
          }
        }
      }
      // 2. Fallback to top score in that week if none explicitly marked
      if (seasonHistory?.compiledWeeks) {
        for (const wNum of seasonHistory.compiledWeeks) {
          if (!map[wNum] || map[wNum].size === 0) {
            let maxWins = -1;
            let topContenders: string[] = [];
            for (const [name, rec] of Object.entries(seasonHistory.records) as [string, any][]) {
              const wWins = rec?.weeklyBreakdown?.[wNum]?.wins;
              if (wWins !== undefined && wWins > maxWins) {
                maxWins = wWins;
                topContenders = [name];
              } else if (wWins !== undefined && wWins === maxWins && maxWins > 0) {
                topContenders.push(name);
              }
            }
            if (topContenders.length > 0) {
              map[wNum] = new Set(topContenders);
            }
          }
        }
      }
    }
    return map;
  }, [seasonHistory]);

  const liveGamesCount = games.filter(g => g.status === 'in_progress').length;
  const decidedGamesCount = games.filter(g => g.status === 'final').length;

  // Calculate actual MNF points if Game 16 is final
  const mnfGame = games.find(g => g.isMNF);
  const mnfActualPoints = mnfGame && mnfGame.status === 'final' 
    ? (mnfGame.awayScore || 0) + (mnfGame.homeScore || 0)
    : null;

  // Active contenders (inactive players hidden from pool standings & sheets)
  const activePlayers = players.filter(p => p.isActive !== false);
  const currentActiveWeek = games.find(g => typeof g.week === 'number' && g.week > 0)?.week
    || (games && games.length > 0 && (games[0] as any).week)
    || (seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0 
      ? Math.max(...seasonHistory.compiledWeeks) + 1 
      : 4);

  const effectiveActiveWeek = currentActiveWeek;

  // Prior compiled historical weeks in ascending order (clean empty array when no prior weeks exist)
  const priorCompiledWeeks = useMemo(() => {
    const rawWeeks = seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0 
      ? seasonHistory.compiledWeeks 
      : [];
    return Array.from(new Set(rawWeeks))
      .filter((w): w is number => typeof w === 'number' && w < currentActiveWeek)
      .sort((a, b) => a - b);
  }, [seasonHistory?.compiledWeeks, currentActiveWeek]);

  const displayedPriorWeeks = useMemo(() => {
    if (showAllWeeks || priorCompiledWeeks.length <= 2) {
      return priorCompiledWeeks;
    }
    return priorCompiledWeeks.slice(-2);
  }, [priorCompiledWeeks, showAllWeeks]);

  // Calculate Season Leaderboard Standings by compiling all weeks week-by-week
  const seasonRecords = seasonHistory?.records || {};
  const seasonStandingsList = activePlayers.map(player => {
    const rec = seasonRecords[player.name];
    const weeklyBreakdown = rec?.weeklyBreakdown || {};

    // Sum all prior compiled historical weeks (excluding current active week)
    let priorCompiledWins = 0;
    let priorCompiledLosses = 0;
    let bestWeek = 0;
    let weeksWon = 0;

    Object.entries(weeklyBreakdown).forEach(([wkStr, wkData]: [string, any]) => {
      const wkNum = Number(wkStr);
      if (wkNum < currentActiveWeek) {
        const wWins = Number(wkData?.wins || 0);
        const wLosses = Number(wkData?.losses || 0);
        priorCompiledWins += wWins;
        priorCompiledLosses += wLosses;
        if (wkData?.isWinner) weeksWon++;
        if (wWins > bestWeek) bestWeek = wWins;
      }
    });

    // Current active week score: tally from active sheet if games are final
    const playerPicks = picks[player.name]?.picks || {};
    let activeSheetWins = 0;
    let activeSheetLosses = 0;
    games.forEach(game => {
      if (game.status === 'final' && game.officialWinner) {
        const pick = playerPicks[game.gameNumber];
        if (pick && pick.toLowerCase() === game.officialWinner.toLowerCase()) {
          activeSheetWins++;
        } else {
          activeSheetLosses++;
        }
      }
    });

    const hasLiveDecided = games.some(g => g.status === 'final');
    const activeWeekWins = hasLiveDecided 
      ? activeSheetWins 
      : (weeklyBreakdown[currentActiveWeek]?.wins ?? 0);
    const activeWeekLosses = hasLiveDecided 
      ? activeSheetLosses 
      : (weeklyBreakdown[currentActiveWeek]?.losses ?? 0);
    const isActiveWinner = weeklyBreakdown[currentActiveWeek]?.isWinner || false;
    if (isActiveWinner) weeksWon++;
    if (activeWeekWins > bestWeek) bestWeek = activeWeekWins;

    // Compiled total across all weeks
    const totalWins = priorCompiledWins + activeWeekWins;
    const totalLosses = priorCompiledLosses + activeWeekLosses;
    const winPct = (totalWins + totalLosses) > 0 
      ? Math.round((totalWins / (totalWins + totalLosses)) * 1000) / 10 
      : 0;

    const compiledBreakdown: Record<number, any> = { ...weeklyBreakdown };
    compiledBreakdown[currentActiveWeek] = {
      week: currentActiveWeek,
      wins: activeWeekWins,
      losses: activeWeekLosses,
      isWinner: isActiveWinner
    };

    return {
      rank: rec?.seasonRank || 1,
      name: player.name,
      totalWins,
      totalLosses,
      weeksWon,
      bestWeek,
      weeklyBreakdown: compiledBreakdown,
      winPct,
      isElvis: player.isElvis || player.name === 'Elvis',
      isDefendingChamp: player.isDefendingChamp,
      role: player.role
    };
  });

  // Sort season standings strictly by total wins desc, alphabetical (no tiebreakers in season standings)
  seasonStandingsList.sort((a, b) => {
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return a.name.localeCompare(b.name);
  });

  // Re-rank season standings with ties
  let currentSeasonRank = 1;
  seasonStandingsList.forEach((s, idx) => {
    if (idx === 0) {
      s.rank = 1;
    } else {
      const prev = seasonStandingsList[idx - 1];
      if (s.totalWins < prev.totalWins) {
        currentSeasonRank = idx + 1;
        s.rank = currentSeasonRank;
      } else {
        s.rank = currentSeasonRank;
      }
    }
  });

  // Compute standings for each active player (both Final and Live Projected)
  const standings: StandingsRow[] = useMemo(() => {
    // Standard live calculation
    const list: StandingsRow[] = activePlayers.map(player => {
      const playerPicks = picks[player.name]?.picks || {};
      const tbPrediction = picks[player.name]?.tiebreaker ?? '';

      let wins = 0;
      let losses = 0;
      let ties = 0;
      let liveWins = 0;
      let liveLosses = 0;
      let liveTies = 0;

      games.forEach(game => {
        const pick = playerPicks[game.gameNumber];
        if (isGameTie(game)) {
          if (pick) ties++;
        } else if (game.status === 'final' && game.officialWinner) {
          if (pick) {
            if (pick.toLowerCase() === game.officialWinner.toLowerCase()) wins++;
            else losses++;
          } else {
            losses++;
          }
        } else if (game.status === 'in_progress' && game.awayScore !== undefined && game.homeScore !== undefined) {
          if (pick) {
            const pickLower = pick.toLowerCase();
            const awayLower = game.awayTeam.toLowerCase();
            const homeLower = game.homeTeam.toLowerCase();
            if (game.awayScore > game.homeScore) {
              if (pickLower === awayLower) liveWins++;
              else if (pickLower === homeLower) liveLosses++;
            } else if (game.homeScore > game.awayScore) {
              if (pickLower === homeLower) liveWins++;
              else if (pickLower === awayLower) liveLosses++;
            } else {
              liveTies++;
            }
          }
        }
      });

      let tbError: number | null = null;
      if (mnfActualPoints !== null && typeof tbPrediction === 'number') {
        tbError = Math.abs(tbPrediction - mnfActualPoints);
      }

      const projectedWins = wins + liveWins;

      const rec = seasonRecords[player.name];
      const weeklyBreakdown = rec?.weeklyBreakdown || {};

      let priorCompiledWins = 0;
      let priorCompiledLosses = 0;
      const weeklyWinDetails: { week: number; wins: number; losses: number; isCurrentWeek?: boolean }[] = [];

      Object.entries(weeklyBreakdown).forEach(([wkStr, wkData]: [string, any]) => {
        const wkNum = Number(wkStr);
        if (wkNum < currentActiveWeek) {
          const wWins = Number(wkData?.wins || 0);
          const wLosses = Number(wkData?.losses || 0);
          priorCompiledWins += wWins;
          priorCompiledLosses += wLosses;
          weeklyWinDetails.push({
            week: wkNum,
            wins: wWins,
            losses: wLosses,
            isCurrentWeek: false
          });
        }
      });

      // Current active week score (from active sheet or compiled)
      const hasLiveDecided = decidedGamesCount > 0;
      const activeWeekWins = hasLiveDecided 
        ? wins 
        : (weeklyBreakdown[currentActiveWeek]?.wins ?? 0);
      const activeWeekLosses = hasLiveDecided 
        ? losses 
        : (weeklyBreakdown[currentActiveWeek]?.losses ?? 0);

      weeklyWinDetails.push({
        week: currentActiveWeek,
        wins: activeWeekWins,
        losses: activeWeekLosses,
        isCurrentWeek: true
      });

      // Sort by week ascending
      weeklyWinDetails.sort((a, b) => a.week - b.week);

      const seasonWins = priorCompiledWins + activeWeekWins;
      const seasonLosses = priorCompiledLosses + activeWeekLosses;
      const seasonRecordItem = seasonStandingsList.find(s => s.name === player.name);

      return {
        rank: 1,
        name: player.name,
        wins,
        losses,
        ties,
        liveWins,
        liveLosses,
        liveTies,
        projectedWins,
        tbPrediction,
        tbError,
        totalScore: rankBy === 'projected' ? projectedWins : wins,
        isElvis: player.isElvis || player.name === 'Elvis',
        isConsultant: player.role === 'consultant',
        isAdmin: player.role === 'admin',
        isDefendingChamp: player.isDefendingChamp,
        seasonWins,
        seasonLosses,
        seasonRank: seasonRecordItem?.rank || rec?.seasonRank || 1,
        seasonWinPct: (seasonWins + seasonLosses) > 0 ? Math.round((seasonWins / (seasonWins + seasonLosses)) * 1000) / 10 : 0,
        weeklyWinDetails
      };
    });

    const maxScore = list.length > 0 ? Math.max(...list.map(s => s.totalScore)) : 0;
    const tiedForFirst = list.filter(s => s.totalScore === maxScore);

    if (tiedForFirst.length > 1 && mnfActualPoints !== null) {
      const contendersWithTb = tiedForFirst.filter(s => s.tbError !== null);
      if (contendersWithTb.length > 0) {
        const minTbError = Math.min(...contendersWithTb.map(s => s.tbError!));
        contendersWithTb.forEach(s => {
          if (s.tbError === minTbError) {
            s.isTiebreakWinner = true;
          }
        });
      }
    }

    // Helper to parse tiebreaker numbers
    const parseTb = (val: any) => {
      if (val === undefined || val === null || val === '') return -1;
      const n = Number(val);
      return isNaN(n) ? -1 : n;
    };

    // Multi-column sorting supporting Season, Current Week, Prior Weeks (e.g. Wk 3), and MNF Tiebreaker
    if (sortBy === 'season') {
      list.sort((a, b) => {
        const aSeason = a.seasonWins ?? 0;
        const bSeason = b.seasonWins ?? 0;
        if (bSeason !== aSeason) return sortDir === 'asc' ? aSeason - bSeason : bSeason - aSeason;
        return a.name.localeCompare(b.name);
      });
    } else if (sortBy === 'tiebreaker') {
      list.sort((a, b) => {
        const aTb = parseTb(a.tbPrediction);
        const bTb = parseTb(b.tbPrediction);
        if (mnfActualPoints !== null) {
          const aErr = a.tbError ?? 999;
          const bErr = b.tbError ?? 999;
          if (aErr !== bErr) return sortDir === 'asc' ? bErr - aErr : aErr - bErr;
        } else {
          if (bTb !== aTb) return sortDir === 'asc' ? aTb - bTb : bTb - aTb;
        }
        return a.name.localeCompare(b.name);
      });
    } else if (sortBy.startsWith('wk-')) {
      const targetWk = parseInt(sortBy.replace('wk-', ''), 10);
      list.sort((a, b) => {
        const aWins = a.weeklyWinDetails?.find(w => w.week === targetWk)?.wins ?? seasonRecords[a.name]?.weeklyBreakdown?.[targetWk]?.wins ?? 0;
        const bWins = b.weeklyWinDetails?.find(w => w.week === targetWk)?.wins ?? seasonRecords[b.name]?.weeklyBreakdown?.[targetWk]?.wins ?? 0;
        if (bWins !== aWins) return sortDir === 'asc' ? aWins - bWins : bWins - aWins;
        const aWinner = seasonRecords[a.name]?.weeklyBreakdown?.[targetWk]?.isWinner || weeklyWinnersByWeek[targetWk]?.has(a.name);
        const bWinner = seasonRecords[b.name]?.weeklyBreakdown?.[targetWk]?.isWinner || weeklyWinnersByWeek[targetWk]?.has(b.name);
        if (aWinner && !bWinner) return -1;
        if (!aWinner && bWinner) return 1;
        const aSeason = a.seasonWins ?? 0;
        const bSeason = b.seasonWins ?? 0;
        if (bSeason !== aSeason) return bSeason - aSeason;
        return a.name.localeCompare(b.name);
      });
    } else {
      // Default & Week sort: sort by current week if games are live/decided, or by reigning weekly winners / season during pre-kickoff
      list.sort((a, b) => {
        if (decidedGamesCount > 0 || liveGamesCount > 0) {
          if (b.totalScore !== a.totalScore) return sortDir === 'asc' ? a.totalScore - b.totalScore : b.totalScore - a.totalScore;
          if (a.totalScore === maxScore && tiedForFirst.length > 1) {
            if (a.isTiebreakWinner && !b.isTiebreakWinner) return -1;
            if (!a.isTiebreakWinner && b.isTiebreakWinner) return 1;
          }
        } else if (leaderScope === 'week' || sortBy === 'week') {
          // Pre-kickoff incoming week: weekly race remains FROZEN on the reigning compiled week so winners stay standing!
          const aPrevWins = a.weeklyWinDetails?.find(w => w.week === latestCompiledWeek)?.wins ?? seasonRecords[a.name]?.weeklyBreakdown?.[latestCompiledWeek]?.wins ?? 0;
          const bPrevWins = b.weeklyWinDetails?.find(w => w.week === latestCompiledWeek)?.wins ?? seasonRecords[b.name]?.weeklyBreakdown?.[latestCompiledWeek]?.wins ?? 0;
          if (bPrevWins !== aPrevWins) return sortDir === 'asc' ? aPrevWins - bPrevWins : bPrevWins - aPrevWins;
          const aWinner = seasonRecords[a.name]?.weeklyBreakdown?.[latestCompiledWeek]?.isWinner;
          const bWinner = seasonRecords[b.name]?.weeklyBreakdown?.[latestCompiledWeek]?.isWinner;
          if (aWinner && !bWinner) return -1;
          if (!aWinner && bWinner) return 1;
        }
        const aSeason = a.seasonWins ?? 0;
        const bSeason = b.seasonWins ?? 0;
        if (bSeason !== aSeason) return sortDir === 'asc' ? aSeason - bSeason : bSeason - aSeason;
        return a.name.localeCompare(b.name);
      });
    }

    let currentRank = 1;
    list.forEach((s, idx) => {
      if (idx === 0) {
        s.rank = 1;
      } else {
        const prev = list[idx - 1];
        let prevCompareVal = 0;
        let currentCompareVal = 0;

        if (sortBy === 'season') {
          prevCompareVal = prev.seasonWins ?? 0;
          currentCompareVal = s.seasonWins ?? 0;
        } else if (sortBy === 'tiebreaker') {
          prevCompareVal = parseTb(prev.tbPrediction);
          currentCompareVal = parseTb(s.tbPrediction);
        } else if (sortBy.startsWith('wk-')) {
          const targetWk = parseInt(sortBy.replace('wk-', ''), 10);
          prevCompareVal = prev.weeklyWinDetails?.find(w => w.week === targetWk)?.wins ?? seasonRecords[prev.name]?.weeklyBreakdown?.[targetWk]?.wins ?? 0;
          currentCompareVal = s.weeklyWinDetails?.find(w => w.week === targetWk)?.wins ?? seasonRecords[s.name]?.weeklyBreakdown?.[targetWk]?.wins ?? 0;
        } else {
          if (decidedGamesCount === 0 && liveGamesCount === 0) {
            if (leaderScope === 'week' || sortBy === 'week') {
              // Pre-kickoff weekly scope: compare reigning week wins so leaders remain standing
              prevCompareVal = prev.weeklyWinDetails?.find(w => w.week === latestCompiledWeek)?.wins ?? seasonRecords[prev.name]?.weeklyBreakdown?.[latestCompiledWeek]?.wins ?? 0;
              currentCompareVal = s.weeklyWinDetails?.find(w => w.week === latestCompiledWeek)?.wins ?? seasonRecords[s.name]?.weeklyBreakdown?.[latestCompiledWeek]?.wins ?? 0;
            } else {
              // Incoming week pre-kickoff season scope: rank by cumulative season total wins
              prevCompareVal = prev.seasonWins ?? 0;
              currentCompareVal = s.seasonWins ?? 0;
            }
          } else {
            prevCompareVal = prev.totalScore;
            currentCompareVal = s.totalScore;
          }
        }

        const isLower = sortDir === 'desc' 
          ? currentCompareVal < prevCompareVal 
          : currentCompareVal > prevCompareVal;

        if (isLower) {
          currentRank = idx + 1;
          s.rank = currentRank;
        } else {
          if (sortBy === 'week' && s.totalScore === maxScore && prev.isTiebreakWinner && !s.isTiebreakWinner) {
            currentRank = idx + 1;
            s.rank = currentRank;
          } else {
            s.rank = currentRank;
          }
        }
      }
    });

    return list;
  }, [games, activePlayers, picks, mnfActualPoints, currentActiveWeek, seasonRecords, latestCompiledWeek, seasonHistory, sortBy, sortDir, decidedGamesCount, seasonStandingsList, rankBy, weeklyWinnersByWeek]);

  // Group contenders by distinct rank tiers (up to 3 tiers: 1st, 2nd, 3rd place blocks)
  // This ensures all tied contenders (e.g. 4 players tied for 3rd in Week 1) appear inside their respective place block
  const seasonRankTiers: (typeof seasonStandingsList)[] = [];
  const seenSeasonRanks = new Set<number>();
  for (const s of seasonStandingsList) {
    if (!seenSeasonRanks.has(s.rank)) {
      if (seenSeasonRanks.size >= 3) break;
      seenSeasonRanks.add(s.rank);
      seasonRankTiers.push([]);
    }
    seasonRankTiers[seasonRankTiers.length - 1].push(s);
  }

  const weekRankTiers: StandingsRow[][] = [];
  const seenWeekRanks = new Set<number>();
  for (const s of standings) {
    if (!seenWeekRanks.has(s.rank)) {
      if (seenWeekRanks.size >= 3) break;
      seenWeekRanks.add(s.rank);
      weekRankTiers.push([]);
    }
    weekRankTiers[weekRankTiers.length - 1].push(s);
  }

  const isMajorLiveActionUnderway = decidedGamesCount >= 10 || liveGamesCount >= 4;
  const hasLiveOrDecidedGames = (decidedGamesCount > 0 || liveGamesCount > 0);

  const isCurrentWeekCompiled = useMemo(() => {
    return seasonHistory?.compiledWeeks?.includes(currentActiveWeek) ?? false;
  }, [seasonHistory?.compiledWeeks, currentActiveWeek]);

  // Reigning champion podium spotlight persists throughout the upcoming week so winners enjoy their moment on top
  const showPrevWeekSpotlight = useMemo(() => {
    return leaderScope === 'week' && (!isMajorLiveActionUnderway || !isCurrentWeekCompiled) && Boolean(seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0);
  }, [leaderScope, isMajorLiveActionUnderway, isCurrentWeekCompiled, seasonHistory?.compiledWeeks]);

  const currentWeekPodiumTiers = useMemo(() => {
    // Only switch away from reigning champions once current week is compiled or in full major Sunday action
    if ((isMajorLiveActionUnderway && isCurrentWeekCompiled) || !seasonHistory?.compiledWeeks || seasonHistory.compiledWeeks.length === 0) {
      return weekRankTiers;
    }

    // Otherwise, compute tiers for the previous compiled week (latestCompiledWeek)
    const prevWeekStandings: StandingsRow[] = [];
    activePlayers.forEach(p => {
      const rec = seasonHistory.records?.[p.name];
      const wkData = rec?.weeklyBreakdown?.[latestCompiledWeek];
      if (wkData) {
        prevWeekStandings.push({
          rank: wkData.isWinner ? 1 : 2,
          name: p.name,
          wins: wkData.wins ?? 0,
          losses: wkData.losses ?? 0,
          liveWins: 0,
          liveLosses: 0,
          liveTies: 0,
          projectedWins: wkData.wins ?? 0,
          tbPrediction: wkData.tiebreaker ?? '',
          tbError: null,
          totalScore: wkData.wins ?? 0,
          isElvis: p.isElvis || p.name === 'Elvis',
          isConsultant: p.role === 'consultant',
          isAdmin: p.role === 'admin',
          isDefendingChamp: p.isDefendingChamp,
          seasonWins: rec.totalWins,
          seasonLosses: rec.totalLosses,
          seasonRank: rec.seasonRank,
          seasonWinPct: (rec.totalWins + rec.totalLosses) > 0 ? Math.round((rec.totalWins / (rec.totalWins + rec.totalLosses)) * 1000) / 10 : 0,
          weeklyWinDetails: [],
          isTiebreakWinner: wkData.isWinner
        });
      }
    });

    // Sort by wins descending, tiebreak winners first
    prevWeekStandings.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (a.isTiebreakWinner && !b.isTiebreakWinner) return -1;
      if (!a.isTiebreakWinner && b.isTiebreakWinner) return 1;
      return a.name.localeCompare(b.name);
    });

    // Rank assign
    let currentRank = 1;
    prevWeekStandings.forEach((s, idx) => {
      if (idx === 0) {
        s.rank = 1;
      } else {
        const prev = prevWeekStandings[idx - 1];
        if (s.totalScore < prev.totalScore) {
          currentRank = idx + 1;
          s.rank = currentRank;
        } else {
          if (prev.isTiebreakWinner && !s.isTiebreakWinner) {
            currentRank = idx + 1;
            s.rank = currentRank;
          } else {
            s.rank = currentRank;
          }
        }
      }
    });

    // Construct tiers
    const prevTiers: StandingsRow[][] = [];
    const seenRanks = new Set<number>();
    for (const s of prevWeekStandings) {
      if (!seenRanks.has(s.rank)) {
        if (seenRanks.size >= 3) break;
        seenRanks.add(s.rank);
        prevTiers.push([]);
      }
      prevTiers[prevTiers.length - 1].push(s);
    }

    return prevTiers;
  }, [seasonHistory, currentActiveWeek, latestCompiledWeek, activePlayers, weekRankTiers, isCurrentWeekCompiled]);

  const podiumTitle = useMemo(() => {
    return leaderScope === 'season'
      ? 'Cumulative Season Standings'
      : showPrevWeekSpotlight && latestCompiledWeek > 0
        ? `Week ${latestCompiledWeek} Reigning Champions Spotlight 👑`
        : `Weekly Race Podium • Week ${currentActiveWeek}`;
  }, [leaderScope, showPrevWeekSpotlight, latestCompiledWeek, currentActiveWeek]);

  const podiumBadge = useMemo(() => {
    return leaderScope === 'season'
      ? (latestCompiledWeek > 0 ? `Through Week ${latestCompiledWeek} of 18` : `Week ${currentActiveWeek} Launch`)
      : showPrevWeekSpotlight && latestCompiledWeek > 0
        ? `Week ${latestCompiledWeek} Champions`
        : `Week ${currentActiveWeek} Race`;
  }, [leaderScope, showPrevWeekSpotlight, latestCompiledWeek, currentActiveWeek]);

  // Filter standings based on search and filters
  const filteredStandings = standings.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterMode === 'leaders') return s.rank <= 5;
    return true;
  });

  const filteredSeasonStandings = seasonStandingsList.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (filterMode === 'leaders') return s.rank <= 5;
    return true;
  });


  return (
    <div className="max-w-7xl mx-auto py-4 px-2 sm:px-4">
      {/* Top Controls Row: Official vs Live Projected Rank Toggle */}
      {liveGamesCount > 0 && (
        <div className="flex items-center justify-between gap-2.5 mb-3">
          <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-300 text-xs font-bold shadow-2xs">
            <button
              onClick={() => setRankBy('final')}
              className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
                rankBy === 'final' ? 'bg-[#1b3a2b] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Official Final Wins
            </button>
            <button
              onClick={() => setRankBy('projected')}
              className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer flex items-center gap-1 ${
                rankBy === 'projected' ? 'bg-amber-600 text-white' : 'text-amber-700 hover:text-amber-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-ping" />
              <span>Live Projected</span>
            </button>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Leaderboard updates in real-time
          </span>
        </div>
      )}

      {/* Running Pool Leaders Card: High-visibility presentation of Weekly Race Leaders & Cumulative Season Standings */}
      <div className="bg-gradient-to-br from-amber-50/95 via-yellow-50/85 to-amber-100/70 border-2 border-amber-300/90 rounded-xl p-3 sm:p-4 shadow-2xs mb-4">
        <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-amber-200/80">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-600" />
            <div className="text-xs font-black text-amber-950 uppercase tracking-wide">
              <span>{podiumTitle}</span>
              <span className="ml-1.5 text-[11px] font-bold text-amber-800 lowercase bg-amber-200/70 px-2 py-0.5 rounded-full">
                {podiumBadge}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Scope Switcher: Weekly Race vs Cumulative Season */}
            <div className="flex items-center bg-white/90 p-0.5 rounded-lg border border-amber-300 text-xs font-bold shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setLeaderScope('week');
                  setSortBy('week');
                }}
                className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer flex items-center gap-1 ${
                  leaderScope === 'week' 
                    ? 'bg-[#1b3a2b] text-white shadow-xs' 
                    : 'text-amber-950 hover:bg-amber-100/60'
                }`}
                title="View current weekly race leader board"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {(isMajorLiveActionUnderway || latestCompiledWeek === 0) ? `Week ${effectiveActiveWeek} Weekly Race` : `Week ${latestCompiledWeek} Reigning Champions`}
                </span>
                <span className="sm:hidden">
                  {(isMajorLiveActionUnderway || latestCompiledWeek === 0) ? `Week ${effectiveActiveWeek}` : `Wk ${latestCompiledWeek} Champs`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLeaderScope('season');
                  setSortBy('season');
                }}
                className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer flex items-center gap-1 ${
                  leaderScope === 'season' 
                    ? 'bg-[#1b3a2b] text-white shadow-xs' 
                    : 'text-amber-950 hover:bg-amber-100/60'
                }`}
                title="View cumulative season points across all completed weeks"
              >
                <Award className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cumulative Season Standings</span>
                <span className="sm:hidden">Season</span>
              </button>
            </div>

            {/* Collapse / Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsPodiumCollapsed(prev => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300/80 text-amber-950 font-bold text-xs border border-amber-300 cursor-pointer shadow-2xs"
            >
              {isPodiumCollapsed ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-amber-900" />
                  <span className="text-[11px]">Podium</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-amber-900" />
                  <span className="text-[11px]">Hide</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Top 3 Contenders Grid Display or Collapsed Ticker */}
        {isPodiumCollapsed ? (
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-amber-950 font-medium">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-amber-900">{leaderScope === 'week' ? 'Weekly Race Leaders:' : 'Season Point Leaders:'}</span>
              {(leaderScope === 'season' ? seasonRankTiers : currentWeekPodiumTiers).map((group, idx) => {
                if (!group || group.length === 0) return null;
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                const score = leaderScope === 'season' 
                  ? `${(group[0] as typeof seasonStandingsList[0]).totalWins}W` 
                  : `${(group[0] as StandingsRow).totalScore}pts`;
                const names = group.map(l => l.name.replace(/\s*\(Vegas Favs\)\s*/i, '')).join(', ');
                return (
                  <span key={idx} className="inline-flex items-center gap-1 font-bold bg-amber-200/50 px-2 py-0.5 rounded-md border border-amber-300/60 text-[11px]">
                    <span>{medal}</span>
                    <span>{names}</span>
                    <span className="font-black text-amber-900">({score})</span>
                  </span>
                );
              })}
            </div>
          </div>
        ) : activePlayers.length === 0 ? (
          <div className="bg-white/95 rounded-xl p-4 border-2 border-dashed border-amber-300 text-center">
            <div className="text-sm font-black text-slate-900">Clean Roster Slate — 0 Contenders Registered</div>
            <p className="text-xs text-slate-600 mt-1">
              Your pool starts with a 100% clean roster with zero fake names. Open the <span className="font-bold text-emerald-800">Setup Wizard</span> in the top navigation bar or visit the <span className="font-bold text-emerald-800">Admin Hub</span> to add your real umpire crew and contenders.
            </p>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 items-stretch">
              {(leaderScope === 'season' ? seasonRankTiers : currentWeekPodiumTiers).map((group, idx) => {
                if (!group || group.length === 0) return null;
                const medalEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                const badgeBg = idx === 0 
                  ? 'bg-amber-400/90 text-amber-950 border-amber-500' 
                  : idx === 1 
                    ? 'bg-slate-200 text-slate-900 border-slate-300' 
                    : 'bg-amber-700/20 text-amber-900 border-amber-600/40';

                const rankNumber = group[0].rank;
                const isSeason = leaderScope === 'season';
                const placeLabel = isSeason
                  ? (rankNumber === 1 ? 'Top Total Wins' : rankNumber === 2 ? '2nd Total Wins' : rankNumber === 3 ? '3rd Total Wins' : `Rank #${rankNumber}`)
                  : (rankNumber === 1 ? '1st Place • Weekly Crown' : rankNumber === 2 ? '2nd Place • Weekly Runner-Up' : rankNumber === 3 ? '3rd Place • Weekly Podium' : `Rank #${rankNumber}`);

                const isTied = group.length > 1;

                // Score text for the block header
                const scoreBadgeText = isSeason
                  ? `${(group[0] as typeof seasonStandingsList[0]).totalWins} Wins`
                  : `${(group[0] as StandingsRow).wins}W${(group[0] as StandingsRow).losses > 0 ? `-${(group[0] as StandingsRow).losses}L` : ''}`;

                return (
                  <div 
                    key={idx}
                    className="bg-white/95 backdrop-blur-xs rounded-xl p-3 border-2 border-amber-200/90 shadow-2xs flex flex-col justify-between"
                  >
                    {/* Block Header */}
                    <div>
                      <div className="flex items-center justify-between gap-1.5 pb-2 mb-2.5 border-b border-amber-200/70">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl shrink-0 select-none" title={`Rank #${rankNumber}`}>
                            {medalEmoji}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                                {placeLabel}
                              </span>
                              {isTied && (
                                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-950 border border-amber-300">
                                  {group.length} Tied
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-black border ${badgeBg}`}>
                            {scoreBadgeText}
                          </span>
                        </div>
                      </div>

                      {/* Contender / Contenders Listing */}
                      {!isTied ? (
                        // Single Contender
                        (() => {
                          const leader = group[0];
                          const isElvis = leader.name === 'Elvis' || (leader as any).isElvis;
                          const seasonLeader = leader as typeof seasonStandingsList[0];
                          const weekLeader = leader as StandingsRow;

                          return (
                            <div className="py-1">
                              <div className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5">
                                {isElvis && <span>🕶️</span>}
                                <span className="truncate">{leader.name.replace(/\s*\(Vegas Favs\)\s*/i, '')}</span>
                                {leader.isDefendingChamp && <span title="Defending Champion" className="text-xs">🛡️</span>}
                                {isSeason && seasonLeader.weeksWon > 0 && (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                                    🏆 {seasonLeader.weeksWon} Wk Won
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-600 font-medium mt-1">
                                {isSeason ? (
                                  <span>
                                    {seasonLeader.totalWins}-{seasonLeader.totalLosses} Record ({seasonLeader.winPct}%) • Best: {seasonLeader.bestWeek}W
                                  </span>
                                ) : (
                                  <span>
                                    {weekLeader.wins}W{weekLeader.losses > 0 ? `-${weekLeader.losses}L` : ''}
                                    {(weekLeader.liveWins ?? 0) > 0 && (
                                      <span className="text-amber-700 font-bold ml-1">+{weekLeader.liveWins} live</span>
                                    )}
                                    {weekLeader.tbPrediction !== '' && weekLeader.tbPrediction !== undefined && (
                                      <span className="text-slate-500 ml-1.5 font-bold">• TB: {weekLeader.tbPrediction}</span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        // Multiple Tied Contenders
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                          {group.map((leader) => {
                            const isElvis = leader.name === 'Elvis' || (leader as any).isElvis;
                            const seasonLeader = leader as typeof seasonStandingsList[0];
                            const weekLeader = leader as StandingsRow;

                            return (
                              <div 
                                key={leader.name}
                                className="bg-amber-50/70 hover:bg-amber-100/60 transition-colors rounded-lg px-2.5 py-1.5 border border-amber-200/80 shadow-2xs flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                  <div className="font-black text-slate-900 text-xs sm:text-sm truncate flex items-center gap-1">
                                    {isElvis && <span>🕶️</span>}
                                    <span className="truncate">{leader.name.replace(/\s*\(Vegas Favs\)\s*/i, '')}</span>
                                    {leader.isDefendingChamp && <span title="Defending Champion" className="text-[10px]">🛡️</span>}
                                  </div>
                                </div>

                                <div className="text-right shrink-0 text-[11px]">
                                  {isSeason ? (
                                    <span className="text-slate-600 font-bold">
                                      {seasonLeader.totalWins}-{seasonLeader.totalLosses}
                                      <span className="text-slate-400 font-normal ml-1 text-[10px]">({seasonLeader.winPct}%)</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-700 font-bold">
                                      {weekLeader.tbPrediction !== '' && weekLeader.tbPrediction !== undefined ? (
                                        <span className="text-slate-600">TB: <span className="font-black text-slate-900">{weekLeader.tbPrediction}</span></span>
                                      ) : (
                                        <span className="text-slate-400 font-normal text-[10px]">TB: —</span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Block Sub-Footer */}
                    <div className="mt-2 pt-2 border-t border-amber-100 text-[10px] text-slate-500 flex items-center justify-between">
                      <span>Rank #{rankNumber} • {!isTied ? 'Sole Possession' : `${group.length}-Way Tie`}</span>
                      <span className="font-bold text-amber-800">
                        {!isTied 
                          ? (isSeason ? `${(group[0] as typeof seasonStandingsList[0]).winPct}% Win Rate` : 'Official Standings')
                          : `All Tied at ${scoreBadgeText}`
                        }
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

        {/* Running Season Leaders Summary Bar */}
        {seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-amber-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-950 font-medium">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-900">{poolConfig.seasonYear} Season Tally:</span>
              <span>{Object.keys(seasonHistory.records || {}).length} Contenders Tracked</span>
              <span className="text-amber-400">•</span>
              <span>Weeks Compiled: {seasonHistory.compiledWeeks.map(w => `Wk ${w}`).join(', ')}</span>
            </div>
            {seasonHistory.lastCompiledAt && (
              <span className="text-[10px] text-amber-800 italic">
                {seasonHistory.lastCompiledAt}
              </span>
            )}
          </div>
        )}
          </div>
        )}
      </div>

      {/* Symmetrical Sub-Banner: Leaderboard View Toggles */}
      <div className="bg-white p-1.5 rounded-xl border border-slate-300 shadow-2xs mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {/* Toggle 1: Vintage Matrix */}
          <button
            onClick={() => setViewMode('vintage')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              viewMode === 'vintage'
                ? 'bg-[#1b3a2b] text-white border-emerald-950 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Vintage Matrix</span>
          </button>

          {/* Toggle 2: Mobile Cards */}
          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              viewMode === 'cards'
                ? 'bg-[#1b3a2b] text-white border-emerald-950 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span>Mobile Cards</span>
          </button>

          {/* Toggle 3: Season Ledger */}
          <button
            onClick={() => setViewMode('season')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              viewMode === 'season'
                ? 'bg-[#1b3a2b] text-white border-emerald-950 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Season Ledger</span>
          </button>

          {/* Toggle 4: Pick Sheets & Printables */}
          <button
            onClick={() => setViewMode('sheets')}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              viewMode === 'sheets'
                ? 'bg-[#1b3a2b] text-white border-emerald-950 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Pick Sheets &amp; Printables</span>
          </button>
        </div>
      </div>

      {/* Official Decoupled League Clock & Live Digital Master Clock */}
      <div className="bg-gradient-to-r from-emerald-950 via-[#0a2f1d] to-emerald-950 text-white rounded-xl border-2 border-emerald-700/80 p-3 sm:p-4 mb-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-900 border border-emerald-600/70 flex items-center justify-center text-amber-300 font-bold shrink-0 shadow-inner text-xl">
            ⏱️
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                Official League Clock • Week {currentActiveWeek}
              </span>
              <span className="bg-emerald-800 text-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-600">
                {pulse.phaseLabel}
              </span>
            </div>
            <div className="text-xs text-emerald-200/90 font-medium mt-0.5">
              {pulse.phaseDescription} • <span className="text-amber-200 font-bold">{pulse.finalGames} of {pulse.totalGames} Games Final</span>
            </div>
          </div>
        </div>

        {/* Real-Time Digital Clock with Time Zone & Daylight Savings */}
        <div className="bg-[#07170e] border border-emerald-700/80 rounded-lg px-3.5 py-1.5 font-mono text-right self-stretch md:self-auto shadow-inner">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center justify-end gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>League Clock</span>
          </div>
          <div className="text-xs sm:text-sm font-black text-amber-300 tracking-tight mt-0.5">
            {formattedDigitalClock}
          </div>
        </div>
      </div>

      {/* VIEW 1: VINTAGE MATRIX (Players Down Left, Games Across Top) */}
      {viewMode === 'vintage' && (
        <div className="bg-white rounded-xl border-2 border-slate-300 shadow-sm overflow-hidden mb-6">
          {/* Table Header Bar / Instructions */}
          <div className="p-3 bg-slate-100 border-b-2 border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-800" />
                <span>Vintage Matrix ({filteredStandings.length} Contenders)</span>
              </span>
              <span className="hidden sm:inline text-slate-500 border-l border-slate-300 pl-3">
                Scroll right → to view all {games.length} games &amp; season totals
              </span>
            </div>

            {/* Print & CSV Export Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintMatrix}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs no-print"
                title="Print spreadsheet in clean landscape Black & White"
              >
                <Printer className="w-3.5 h-3.5 text-amber-300" />
                <span>Print Sheet</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-800 hover:bg-slate-100 border border-slate-300 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs no-print"
                title="Download spreadsheet data to CSV"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>CSV</span>
              </button>
            </div>

            {/* Quick Reorder Controls */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                Reorder:
              </span>
              <button
                type="button"
                onClick={() => handleSort('week')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer border ${
                  sortBy === 'week'
                    ? 'bg-[#1b3a2b] text-white border-emerald-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
                title="Reorder by Current Week score"
              >
                Wk {currentActiveWeek} {sortBy === 'week' && (sortDir === 'desc' ? '▼' : '▲')}
              </button>
              {latestCompiledWeek > 0 && (
                <button
                  type="button"
                  onClick={() => handleSort(`wk-${latestCompiledWeek}`)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer border ${
                    sortBy === `wk-${latestCompiledWeek}`
                      ? 'bg-[#1b3a2b] text-amber-200 border-emerald-900 shadow-2xs ring-1 ring-amber-300'
                      : 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100 font-extrabold'
                  }`}
                  title={`Reorder by Previous Week (Week ${latestCompiledWeek}) points`}
                >
                  Prev Wk {latestCompiledWeek} {sortBy === `wk-${latestCompiledWeek}` && (sortDir === 'desc' ? '▼' : '▲')}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleSort('season')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer border ${
                  sortBy === 'season'
                    ? 'bg-[#1b3a2b] text-white border-emerald-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
                title="Reorder by Season Total Wins"
              >
                Season {sortBy === 'season' && (sortDir === 'desc' ? '▼' : '▲')}
              </button>
              <button
                type="button"
                onClick={() => handleSort('tiebreaker')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer border ${
                  sortBy === 'tiebreaker'
                    ? 'bg-purple-900 text-purple-100 border-purple-950 shadow-2xs'
                    : 'bg-purple-50 text-purple-950 border-purple-200 hover:bg-purple-100'
                }`}
                title="Reorder by MNF Tiebreaker"
              >
                MNF TB {sortBy === 'tiebreaker' && (sortDir === 'desc' ? '▼' : '▲')}
              </button>
            </div>

            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1 text-emerald-900">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                <span>Win (1 pt)</span>
              </span>
              <span className="flex items-center gap-1 text-rose-800">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                <span>Loss</span>
              </span>
              <span className="flex items-center gap-1 text-amber-800">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                <span>Live</span>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto contain-content" style={{ contain: 'content' }}>
            <table className="w-full text-xs text-left border-collapse min-w-[1300px]">
              <thead>
                {/* Header Row 1: Columns */}
                <tr className="bg-[#142d21] text-white">
                  {/* Sticky Column 1: Rank */}
                  <th className="sticky left-0 z-30 bg-[#142d21] px-1 py-2.5 font-extrabold text-center border-r-2 border-emerald-900 w-[38px] min-w-[38px] max-w-[38px] shadow-sm text-[11px]">
                    #
                  </th>
                  {/* Sticky Column 2: Player Name */}
                  <th className="sticky left-[38px] z-30 bg-[#142d21] px-2 py-2.5 font-extrabold border-r-2 border-emerald-900 w-[120px] min-w-[120px] max-w-[120px] shadow-sm text-xs select-none">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">Contender</span>
                      {priorCompiledWeeks.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setShowAllWeeks(prev => !prev)}
                          className="px-1.5 py-0.5 rounded bg-emerald-800 hover:bg-emerald-700 text-[9px] text-amber-200 transition-colors font-bold cursor-pointer"
                          title={showAllWeeks ? "Show only last 2 completed weeks" : "Show all completed weeks"}
                        >
                          {showAllWeeks ? "2 Wks" : "All Wks"}
                        </button>
                      )}
                    </div>
                  </th>

                  {/* Prior Weeks Columns (Wk 1, Wk 2, ...) counting towards current week */}
                  {displayedPriorWeeks.map(wkNum => {
                    const isSorted = sortBy === `wk-${wkNum}`;
                    const isPrevWeek = wkNum === latestCompiledWeek;
                    return (
                      <th
                        key={`hdr-wk-${wkNum}`}
                        className={`px-1 py-2 font-extrabold text-center border-r border-emerald-800 w-[44px] min-w-[44px] text-[10px] cursor-pointer transition-colors ${
                          isSorted 
                            ? 'bg-[#24583c] text-amber-200 ring-1 ring-amber-300/60 shadow-inner' 
                            : 'bg-[#163827] text-amber-200/90 hover:bg-[#1f4e37]'
                        }`}
                        onClick={() => handleSort(`wk-${wkNum}`)}
                        title={`Week ${wkNum} Official Wins (${isPrevWeek ? 'Previous Week' : 'Past Week'}). Click to reorder board by Week ${wkNum} points.`}
                      >
                        <div className="flex flex-col items-center leading-tight">
                          <span className="text-[10px] font-bold flex items-center gap-0.5">
                            Wk {wkNum} {isSorted && <span className="text-amber-300 text-[8px]">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                          </span>
                          <span className={`text-[8px] ${isPrevWeek ? 'text-amber-300 font-bold' : 'text-emerald-300/80 font-normal'}`}>
                            {isPrevWeek ? 'Prev Wk' : 'Past'}
                          </span>
                        </div>
                      </th>
                    );
                  })}

                  {/* Current Week Score Column */}
                  <th 
                    className={`px-1.5 py-2 font-extrabold text-center border-r border-emerald-800 w-[54px] min-w-[54px] text-amber-300 cursor-pointer transition-colors ${
                      sortBy === 'week' ? 'bg-[#24583c] ring-1 ring-amber-300/60 shadow-inner' : 'bg-[#1b3a2b] hover:bg-[#234d39]'
                    }`}
                    onClick={() => handleSort('week')}
                    title="Click to sort/reorder by Current Week Score"
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span className="flex items-center gap-0.5 text-[11px]">
                        Wk {currentActiveWeek} {sortBy === 'week' && <span className="text-[9px]">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                      </span>
                      <span className="text-[9px] text-emerald-200/90 font-normal">Current</span>
                    </div>
                  </th>
                  <th className="px-1 py-2 font-bold text-center border-r border-emerald-800 bg-[#1b3a2b] w-[48px] min-w-[48px] text-[11px]">
                    W - L
                  </th>
                  {/* Season Total Wins Column */}
                  <th 
                    className={`px-1.5 py-2 font-extrabold text-center border-r border-emerald-800 w-[64px] min-w-[64px] text-amber-300 cursor-pointer transition-colors shadow-xs ${
                      sortBy === 'season' ? 'bg-[#24583c] ring-1 ring-amber-300/60 shadow-inner' : 'bg-[#173d2a] hover:bg-[#1f4e37]'
                    }`}
                    onClick={() => handleSort('season')}
                    title="Season Total Wins: Compiled week-by-week for each player across the season. Click to sort/reorder."
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span className="flex items-center gap-0.5 text-amber-200 text-[11px]">
                        Season {sortBy === 'season' && <span className="text-[9px]">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                      </span>
                      <span className="text-[9px] text-amber-300 font-bold">Total Wins</span>
                    </div>
                  </th>
                  <th 
                    className={`px-1 py-2 font-bold text-center border-r-2 border-emerald-900 w-[52px] min-w-[52px] text-purple-200 text-[10px] cursor-pointer transition-colors ${
                      sortBy === 'tiebreaker' ? 'bg-[#291e3b] text-purple-200 ring-1 ring-purple-400/60 shadow-inner' : 'bg-[#1b3a2b] hover:bg-[#254636]'
                    }`}
                    onClick={() => handleSort('tiebreaker')}
                    title="Monday Night Football Tiebreaker: Combined total points. Click to sort/reorder by MNF Tiebreaker."
                  >
                    <div className="flex flex-col items-center leading-tight">
                      <span className="flex items-center gap-0.5">
                        MNF TB {sortBy === 'tiebreaker' && <span className="text-amber-300 text-[8px]">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                      </span>
                      <span className="text-[8px] text-purple-300/80 font-normal">Tiebreaker</span>
                    </div>
                  </th>
                  {/* 16 Games Header */}
                  {games.map(game => (
                    <th
                      key={game.gameNumber}
                      className={`px-1 py-2 font-bold text-center border-r w-[72px] min-w-[72px] max-w-[72px] transition-colors ${
                        isGameTie(game)
                          ? 'border-sky-600 bg-sky-900/75 text-sky-100 ring-1 ring-sky-400/50 backdrop-blur-xs'
                          : 'border-emerald-800/80 bg-[#1b3a2b]'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span className="text-[10px] font-extrabold text-amber-300">
                          G{game.gameNumber}
                        </span>
                        {game.isMNF && (
                          <span className="bg-amber-400 text-slate-950 text-[7px] font-black px-0.5 rounded leading-none">MNF</span>
                        )}
                      </div>
                      <div className="text-[9px] leading-tight font-semibold mt-0.5" title={`${game.awayTeam} @ ${game.homeTeam}`}>
                        <div className="text-emerald-100 truncate">{game.awayTeam}</div>
                        <div className="text-emerald-200/90 truncate font-medium">@{game.homeTeam}</div>
                      </div>
                      <div className="text-[8px] text-emerald-300/80 font-normal">
                        {game.kickoffTime}
                      </div>
                    </th>
                  ))}
                </tr>

                {/* Header Row 2: Official Game Winner & Live Status */}
                <tr className="bg-[#1f4a36] text-white border-b-2 border-emerald-950">
                  <th className="sticky left-0 z-30 bg-[#1f4a36] px-1 py-1.5 text-center text-[9px] font-bold border-r-2 border-emerald-900 text-amber-300 w-[38px] min-w-[38px]">
                    LIVE
                  </th>
                  <th className="sticky left-[38px] z-30 bg-[#1f4a36] px-2 py-1.5 text-[9px] font-extrabold border-r-2 border-emerald-900 text-amber-300 uppercase tracking-wide w-[120px] min-w-[120px] truncate">
                    🏆 Winners
                  </th>
                  {/* Prior Weeks Subheaders */}
                  {displayedPriorWeeks.map(wkNum => {
                    const isSorted = sortBy === `wk-${wkNum}`;
                    return (
                      <th
                        key={`hdr2-wk-${wkNum}`}
                        className={`px-1 py-1.5 text-center border-r border-emerald-800 text-[8px] font-bold w-[44px] min-w-[44px] cursor-pointer transition-colors ${
                          isSorted ? 'bg-[#24583c] text-amber-300' : 'bg-[#173827] text-emerald-300/80 hover:text-emerald-200'
                        }`}
                        onClick={() => handleSort(`wk-${wkNum}`)}
                        title={`Click to reorder by Week ${wkNum} points`}
                      >
                        Final {isSorted && (sortDir === 'desc' ? '▼' : '▲')}
                      </th>
                    );
                  })}
                  <th colSpan={4} className="px-1.5 py-1.5 text-center text-[9px] font-bold border-r-2 border-emerald-900 bg-[#193d2c] text-emerald-200">
                    Totals
                  </th>
                  {games.map(game => {
                    const isFinal = game.status === 'final';
                    const isLive = game.status === 'in_progress';
                    return (
                      <th
                        key={game.gameNumber}
                        className={`px-1 py-1.5 text-center border-r w-[72px] min-w-[72px] max-w-[72px] ${
                          isGameTie(game)
                            ? 'border-sky-600 bg-sky-950/80 text-sky-200'
                            : 'border-emerald-800 bg-[#193d2c]'
                        }`}
                      >
                        {isFinal && isGameTie(game) ? (
                          <div className="bg-sky-200 text-sky-950 font-black px-1 py-0.5 rounded text-[9px] uppercase shadow-xs truncate border border-sky-400" title="Official NFL Tie (Straight Up Push — 0 Pts)">
                            ⚖️ TIE (0 Pts)
                          </div>
                        ) : isFinal && game.officialWinner ? (
                          <div className="bg-emerald-500 text-emerald-950 font-black px-1 py-0.5 rounded text-[9px] uppercase shadow-xs truncate" title={`Winner: ${game.officialWinner}`}>
                            ✓ {game.officialWinner}
                          </div>
                        ) : isLive ? (
                          <div className="bg-amber-400 text-slate-950 font-black px-0.5 py-0.5 rounded text-[8px] uppercase animate-pulse flex flex-col items-center leading-none shadow-xs" title={game.statusDetail || 'Live Game'}>
                            <span>⚡ {game.quarter || 'Live'}</span>
                            <span className="text-[7px] font-mono">{game.awayScore ?? 0}-{game.homeScore ?? 0}</span>
                          </div>
                        ) : (
                          <span className="text-emerald-300/60 text-[9px] font-normal">
                            —
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {filteredStandings.map((row, index) => {
                  const isUserRow = activePlayer?.name === row.name;
                  const rankBadgeColor = 
                    row.rank === 1 ? 'bg-amber-400 text-amber-950 font-black shadow-xs' :
                    row.rank === 2 ? 'bg-slate-300 text-slate-900 font-black' :
                    row.rank === 3 ? 'bg-amber-700 text-white font-black' :
                    'bg-slate-100 text-slate-700 font-bold';

                  const rowBg = isUserRow 
                    ? 'bg-emerald-50/70 hover:bg-emerald-100/70' 
                    : index % 2 === 0 
                      ? 'bg-white hover:bg-slate-50' 
                      : 'bg-slate-50/60 hover:bg-slate-100/60';

                  const playerPickData = picks[row.name]?.picks || {};

                  return (
                    <tr 
                      key={row.name} 
                      className={`border-b border-slate-200 transition-colors ${rowBg} ${isUserRow ? 'ring-2 ring-emerald-500 ring-inset' : ''}`}
                    >
                      {/* Sticky Rank */}
                      <td className={`sticky left-0 z-20 px-1 py-1.5 text-center border-r-2 border-slate-300 w-[38px] min-w-[38px] max-w-[38px] ${isUserRow ? 'bg-emerald-100' : 'bg-white'}`}>
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${rankBadgeColor}`}>
                          {row.rank}
                        </span>
                      </td>

                      {/* Sticky Contender Name (Narrowed, No Email) */}
                      <td className={`sticky left-[38px] z-20 px-2 py-1.5 border-r-2 border-slate-300 w-[120px] min-w-[120px] max-w-[120px] transition-all ${
                        row.name === currentWeeklyWinnerName
                          ? 'bg-amber-100/95 text-amber-950 font-black border-r-2 border-amber-400 shadow-xs'
                          : isUserRow ? 'bg-emerald-100' : 'bg-white'
                      }`}>
                        <div className="flex items-center justify-between gap-1 min-w-0" title={row.name}>
                          <div className="font-bold text-slate-950 flex items-center gap-1 text-xs truncate min-w-0">
                            {row.name === currentWeeklyWinnerName && (
                              <span title={`Reigning Week ${latestCompiledWeek} Winner`} className="text-amber-700 select-none text-[11px] shrink-0">
                                👑
                              </span>
                            )}
                            {row.isElvis && <span className="text-[11px] shrink-0">🕶️</span>}
                            {row.isDefendingChamp && <span title="Defending Champion" className="text-[11px] shrink-0">🏆</span>}
                            <span className="truncate">{row.name.replace(/\s*\(Vegas Favs\)\s*/i, '')}</span>
                          </div>
                          {row.name === currentWeeklyWinnerName && (
                            <span className="inline-flex items-center bg-amber-400 text-amber-950 px-1 py-0.2 rounded text-[8px] font-black uppercase tracking-wide border border-amber-600 shrink-0">
                              Wk{latestCompiledWeek}
                            </span>
                          )}
                          {isUserRow && row.name !== currentWeeklyWinnerName && (
                            <span className="text-[8px] font-black bg-emerald-800 text-white px-1 py-0.2 rounded uppercase tracking-wider shrink-0">
                              You
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Prior Compiled Weeks (Wk 1, Wk 2, ...) */}
                      {displayedPriorWeeks.map(wkNum => {
                        const wkRecord = row.weeklyWinDetails?.find(w => w.week === wkNum);
                        const wWins = wkRecord?.wins ?? seasonRecords[row.name]?.weeklyBreakdown?.[wkNum]?.wins;
                        const isWeekWinner = Boolean(
                          seasonRecords[row.name]?.weeklyBreakdown?.[wkNum]?.isWinner ||
                          weeklyWinnersByWeek[wkNum]?.has(row.name)
                        );

                        const isSortedCol = sortBy === `wk-${wkNum}`;
                        return (
                          <td 
                            key={`row-wk-${wkNum}`}
                            className={`px-1 py-1 text-center border-r border-slate-300 text-xs w-[44px] min-w-[44px] transition-colors ${
                              isSortedCol
                                ? 'bg-amber-100/90 text-amber-950 font-black ring-1 ring-amber-400/60 ring-inset'
                                : isWeekWinner 
                                  ? 'bg-amber-100/50 text-amber-950 font-black' 
                                  : 'bg-slate-50/70 text-slate-800 font-bold'
                            }`}
                            title={`Week ${wkNum}${isWeekWinner ? ` Winner: ${row.name}` : ''}: ${wWins !== undefined ? `${wWins} Wins` : '—'}`}
                          >
                            {wWins !== undefined ? (
                              isWeekWinner ? (
                                <span className="inline-flex items-center justify-center gap-0.5 px-1 py-0.5 rounded-md bg-amber-300/40 border border-amber-400/60 text-amber-950 font-black shadow-2xs">
                                  <span className="text-[9px]">👑</span>
                                  <span>{wWins}</span>
                                </span>
                              ) : (
                                <span>{wWins}</span>
                              )
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">—</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Week Total Score */}
                      <td className={`px-1.5 py-1.5 text-center border-r border-slate-300 font-black text-xs w-[54px] min-w-[54px] ${
                        sortBy === 'week' ? 'bg-emerald-100 text-emerald-950 ring-1 ring-emerald-400/60 ring-inset' : 'text-emerald-800 bg-emerald-50/50'
                      }`}>
                        <div className="flex flex-col items-center">
                          {decidedGamesCount > 0 || liveGamesCount > 0 ? (
                            <>
                              <span className="text-xs font-black">{row.totalScore}</span>
                              {row.liveWins ? (
                                <span className="text-[8px] font-black text-amber-700 bg-amber-100 px-0.5 rounded-xs leading-tight mt-0.5">
                                  +{row.liveWins}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">—</span>
                          )}
                        </div>
                      </td>

                      {/* Wins - Losses (Week) */}
                      <td className="px-1 py-1.5 text-center border-r border-slate-300 text-slate-700 font-bold text-[11px] w-[48px] min-w-[48px]">
                        {decidedGamesCount > 0 || liveGamesCount > 0 ? (
                          row.ties && row.ties > 0 ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>

                      {/* Season Total Wins */}
                      <td 
                        className={`px-1 py-1.5 text-center border-r border-slate-300 font-black w-[64px] min-w-[64px] ${
                          sortBy === 'season' ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-400/60 ring-inset' : 'bg-amber-50/80 text-amber-950'
                        }`}
                        title={`Season Total: ${row.seasonWins ?? 0} Wins`}
                      >
                        <div className="flex items-center justify-center min-h-[28px]">
                          <span className="text-xs font-black text-amber-900">{row.seasonWins ?? 0}</span>
                        </div>
                      </td>

                      {/* MNF Tiebreaker */}
                      <td className={`px-1 py-1.5 text-center border-r-2 border-slate-300 text-purple-950 font-bold text-[11px] w-[52px] min-w-[52px] ${
                        sortBy === 'tiebreaker' ? 'bg-purple-100 text-purple-950 ring-1 ring-purple-400/60 ring-inset' : 'bg-purple-50/40'
                      }`}>
                        {row.tbPrediction !== '' && row.tbPrediction !== undefined ? (
                          <div className="leading-tight">
                            <div className="flex items-center justify-center gap-0.5">
                              {picks[row.name]?.isAutoDefaultTiebreaker && (
                                <span title="Over/Under tiebreaker auto-assigned at kickoff (Dad's Rule)" className="text-[9px]">🤖</span>
                              )}
                              <span className="font-extrabold text-purple-900">{row.tbPrediction}</span>
                            </div>
                            {row.tbError !== null && (
                              <span className="block text-[8px] text-purple-700 font-normal">
                                ±{row.tbError}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal text-[10px]">—</span>
                        )}
                      </td>

                      {/* 16 Games Picks */}
                      {games.map(game => {
                        const pick = playerPickData[game.gameNumber];
                        const isAutoDefault = picks[row.name]?.autoDefaultGames?.includes(game.gameNumber);
                        const isFinal = game.status === 'final';
                        const isLive = game.status === 'in_progress';
                        const winner = game.officialWinner;
                        const isTie = isGameTie(game);
                        const isLiveTied = isGameLiveTied(game);

                        let cellClass = 'bg-white text-slate-800 border-slate-200';
                        let isCorrect = false;
                        let isWrong = false;
                        let isLeading = false;
                        let isTrailing = false;

                        if (isTie && pick) {
                          cellClass = 'bg-sky-100/75 text-sky-950 font-bold border-sky-300 ring-1 ring-sky-300/60 shadow-2xs';
                        } else if (isFinal && winner && pick) {
                          if (pick.toLowerCase() === winner.toLowerCase()) {
                            isCorrect = true;
                            cellClass = 'bg-emerald-100 text-emerald-950 font-black border-emerald-300';
                          } else {
                            isWrong = true;
                            cellClass = 'bg-rose-50 text-rose-700 font-semibold border-rose-200 line-through decoration-rose-300';
                          }
                        } else if (isLive && pick && game.awayScore !== undefined && game.homeScore !== undefined) {
                          if (isLiveTied) {
                            cellClass = 'bg-sky-50/80 text-sky-900 font-semibold border-sky-200';
                          } else {
                            const pickLower = pick.toLowerCase();
                            const awayLower = game.awayTeam.toLowerCase();
                            const homeLower = game.homeTeam.toLowerCase();
                            if (game.awayScore > game.homeScore) {
                              if (pickLower === awayLower) isLeading = true;
                              else if (pickLower === homeLower) isTrailing = true;
                            } else if (game.homeScore > game.awayScore) {
                              if (pickLower === homeLower) isLeading = true;
                              else if (pickLower === awayLower) isTrailing = true;
                            }

                            if (isLeading) {
                              cellClass = 'bg-emerald-100 text-emerald-950 font-black border-emerald-400 ring-2 ring-emerald-400/50';
                            } else if (isTrailing) {
                              cellClass = 'bg-rose-50 text-rose-800 font-semibold border-rose-200';
                            } else {
                              cellClass = 'bg-amber-100/90 text-amber-950 font-bold border-amber-300';
                            }
                          }
                        } else if (pick) {
                          cellClass = 'bg-white text-slate-900 font-bold border-slate-200';
                        }

                        return (
                          <td
                            key={game.gameNumber}
                            className={`px-1 py-1.5 text-center border-r border-b text-[10px] w-[72px] min-w-[72px] max-w-[72px] ${cellClass}`}
                          >
                            {pick ? (
                              <div 
                                className="flex items-center justify-center gap-0.5 truncate" 
                                title={`Pick: ${pick}${isAutoDefault ? ' (Auto-defaulted Vegas Favorite at kickoff)' : ''}${isTie ? ' (Official Game Tie - Push)' : isLive ? ` (Live: ${game.awayTeam} ${game.awayScore ?? 0} - ${game.homeTeam} ${game.homeScore ?? 0})` : ''}`}
                              >
                                {isAutoDefault && (
                                  <span className="text-[9px] text-amber-700 font-bold shrink-0" title="Vegas Opening Favorite auto-assigned at kickoff (Dad's Rule)">
                                    🤖
                                  </span>
                                )}
                                {isTie && <span className="text-[9px] font-black shrink-0" title="Tie (Push)">⚖️</span>}
                                {isCorrect && <Check className="w-2.5 h-2.5 text-emerald-700 stroke-[3] shrink-0" />}
                                {isWrong && <X className="w-2.5 h-2.5 text-rose-500 shrink-0" />}
                                {isLive && isLeading && <span className="text-[8px] font-black text-emerald-700 shrink-0">▲</span>}
                                {isLive && isTrailing && <span className="text-[8px] font-black text-rose-600 shrink-0">▼</span>}
                                {isLive && isLiveTied && <span className="text-[8px] font-bold text-sky-600 shrink-0">⚖️</span>}
                                <span className="truncate">{pick}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-normal">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Visual Color Legend */}
            <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-700 font-medium">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-slate-900 text-xs">Sheet Color Guide:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-100 border border-emerald-400"></span>
                  <span className="text-emerald-950 font-bold">Green = Win</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-rose-50 border border-rose-300"></span>
                  <span className="text-rose-800 font-semibold">Red = Loss</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-sky-100/80 border border-sky-400"></span>
                  <span className="text-sky-950 font-bold">Translucent Light Blue = ⚖️ Game Tie (Push)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-amber-100 border border-amber-300"></span>
                  <span className="text-amber-950 font-semibold">Gold = In-Progress</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-xs">🤖</span>
                  <span className="text-slate-800 font-bold">Dad&apos;s Rule (Kickoff Auto-Default)</span>
                </span>
              </div>
              <span className="text-slate-500 italic text-[10px]">
                Straight-Up Pool: Tied games score as a Push (No win/loss penalty)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: MOBILE CARDS VIEW */}
      {viewMode === 'cards' && (
        <div className="space-y-3 mb-6 contain-list" style={{ contain: 'content' }}>
          {filteredStandings.map(s => {
            const isFirst = s.rank === 1;
            const isUserRow = activePlayer?.name === s.name;
            const isWeeklyWinner = s.name === currentWeeklyWinnerName;
            return (
              <div
                key={s.name}
                className={`bg-white rounded-xl p-4 border-2 transition-all ${
                  isWeeklyWinner
                    ? 'border-amber-400 bg-gradient-to-r from-amber-50/90 via-yellow-50/40 to-white shadow-md ring-2 ring-amber-300/40'
                    : isUserRow
                      ? 'border-emerald-500 bg-emerald-50/30 shadow-md ring-2 ring-emerald-400/40'
                      : isFirst 
                        ? 'border-amber-300 bg-gradient-to-r from-amber-50/50 to-white shadow-xs' 
                        : 'border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-200 gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm ${
                      isWeeklyWinner
                        ? 'bg-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-400'
                        : isFirst 
                          ? 'bg-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-300' 
                          : 'bg-slate-100 text-slate-800 border border-slate-300'
                    }`}>
                      #{s.rank}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-base flex items-center gap-1.5 flex-wrap">
                        {isWeeklyWinner && <span className="text-amber-600 animate-bounce">👑</span>}
                        <span>{s.name.replace(/\s*\(Vegas Favs\)\s*/i, '')}</span>
                        {isWeeklyWinner && (
                          <span className="text-[10px] bg-amber-400 text-amber-950 px-2 py-0.5 rounded font-black border border-amber-500 shadow-2xs">
                            👑 Reigning Wk {latestCompiledWeek} Winner
                          </span>
                        )}
                        {isUserRow && <span className="text-[10px] bg-emerald-700 text-white px-2 py-0.5 rounded font-extrabold">YOU</span>}
                        {s.isDefendingChamp && <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-bold">🏆 Champ</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        MNF Guess: <strong className="text-purple-950">{s.tbPrediction !== '' ? `${s.tbPrediction} pts` : 'Not set'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Dual Score & Season Total display */}
                  <div className="flex items-center gap-2">
                    <div 
                      className="text-center px-2.5 py-1 bg-amber-50 rounded-lg border border-amber-200"
                      title={`Season Total: ${s.seasonWins ?? 0} Wins`}
                    >
                      <div className="text-[9px] font-extrabold text-amber-900 uppercase">Season Total</div>
                      <div className="text-base font-black text-amber-950">{s.seasonWins ?? 0} <span className="text-[10px] font-bold text-amber-800">W</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-emerald-800 leading-none">
                        {s.totalScore} <span className="text-xs text-slate-500 font-bold">pts</span>
                      </div>
                      <div className="text-xs font-bold text-slate-600 mt-1">
                        {s.ties && s.ties > 0 ? `${s.wins}W - ${s.losses}L - ${s.ties}T` : `${s.wins}W - ${s.losses}L`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick game pills */}
                <div>
                  <div className="text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Game Picks:
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-xs">
                    {games.map(game => {
                      const pick = picks[s.name]?.picks[game.gameNumber];
                      const isAutoDefault = picks[s.name]?.autoDefaultGames?.includes(game.gameNumber);
                      const isFinal = game.status === 'final';
                      const winner = game.officialWinner;
                      const isTie = isGameTie(game);
                      const isCorrect = !isTie && isFinal && winner && pick?.toLowerCase() === winner.toLowerCase();
                      const isWrong = !isTie && isFinal && winner && pick && pick.toLowerCase() !== winner.toLowerCase();

                      return (
                        <div
                          key={game.gameNumber}
                          className={`p-1.5 rounded-lg border text-center ${
                            isTie && pick
                              ? 'bg-sky-100/75 text-sky-950 border-sky-300 font-bold ring-1 ring-sky-300/50'
                              : isCorrect 
                                ? 'bg-emerald-100 text-emerald-950 border-emerald-300 font-black' 
                                : isWrong 
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 line-through' 
                                  : 'bg-slate-50 text-slate-800 border-slate-200 font-semibold'
                          }`}
                        >
                          <div className="truncate font-bold text-[11px] flex items-center justify-center gap-0.5">
                            {isAutoDefault && <span className="text-[9px] text-amber-700 font-bold shrink-0" title="Auto-assigned Vegas Favorite at kickoff (Dad's Rule)">🤖</span>}
                            {isTie && <span className="text-[10px]">⚖️</span>}
                            <span>{pick || '—'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 3: FULL SEASON STANDINGS LEDGER */}
      {viewMode === 'season' && (
        <div className="bg-white rounded-xl border-2 border-slate-300 shadow-sm overflow-hidden mb-6">
          <div className="p-4 bg-gradient-to-r from-amber-900 via-[#1b3a2b] to-[#142d21] text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black uppercase tracking-wide text-amber-300">
                  {poolConfig.leagueName} • {poolConfig.seasonYear} Season Standings Ledger
                </h3>
              </div>
              <p className="text-xs text-amber-100/80 mt-0.5">
                Cumulative season total wins, win percentages, weekly honors & historical rankings
              </p>
            </div>
            {seasonHistory?.compiledWeeks && (
              <div className="text-xs bg-black/30 border border-amber-400/30 px-3 py-1.5 rounded-lg font-mono text-amber-200">
                Weeks Active: {seasonHistory.compiledWeeks.join(', ')}
              </div>
            )}
          </div>

          <div className="overflow-x-auto contain-content" style={{ contain: 'content' }}>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#142d21] text-white border-b-2 border-emerald-900">
                  <th className="px-3 py-3 font-extrabold text-center w-[60px]">Rank</th>
                  <th className="px-4 py-3 font-extrabold w-[220px]">Contender</th>
                  <th className="px-3 py-3 font-extrabold text-center bg-[#1b3a2b] text-amber-300 w-[120px]">Season Total Wins</th>
                  <th className="px-3 py-3 font-bold text-center w-[90px]">Record</th>
                  <th className="px-3 py-3 font-bold text-center w-[90px]">Win %</th>
                  <th className="px-3 py-3 font-bold text-center w-[100px]">Weeks Won</th>
                  <th className="px-3 py-3 font-bold text-center w-[100px]">Best Week</th>
                  <th className="px-4 py-3 font-bold">Weekly Performance</th>
                </tr>
              </thead>
              <tbody>
                {filteredSeasonStandings.map((s, idx) => {
                  const isUser = activePlayer?.name === s.name;
                  const isTop = s.rank === 1;
                  const isWeeklyWinner = s.name === currentWeeklyWinnerName;
                  const badgeColor = 
                    s.rank === 1 ? 'bg-amber-400 text-amber-950 font-black shadow-xs' :
                    s.rank === 2 ? 'bg-slate-300 text-slate-900 font-black' :
                    s.rank === 3 ? 'bg-amber-700 text-white font-black' :
                    'bg-slate-100 text-slate-700 font-bold';

                  const rowBg = isWeeklyWinner
                    ? 'bg-amber-50/90 hover:bg-amber-100/90 ring-1 ring-amber-300'
                    : isUser 
                      ? 'bg-emerald-50/80 hover:bg-emerald-100/80 ring-2 ring-emerald-500 ring-inset' 
                      : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/70 hover:bg-slate-100/70';

                  return (
                    <tr key={s.name} className={`border-b border-slate-200 transition-colors ${rowBg}`}>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${badgeColor}`}>
                          {s.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`font-black flex items-center gap-1.5 text-sm ${
                            isWeeklyWinner ? 'text-amber-950 font-black' : 'text-slate-900'
                          }`}>
                            {isWeeklyWinner && <span className="text-amber-700 select-none">👑</span>}
                            {s.isDefendingChamp && <span title="Defending Champion">🏆</span>}
                            <span>{s.name.replace(/\s*\(Vegas Favs\)\s*/i, '')}</span>
                          </div>
                          {isWeeklyWinner && (
                            <span className="text-[9px] bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded font-black border border-amber-600 shadow-2xs whitespace-nowrap">
                              Wk {latestCompiledWeek} Winner
                            </span>
                          )}
                          {isUser && !isWeeklyWinner && (
                            <span className="text-[9px] bg-emerald-800 text-white px-1.5 py-0.2 rounded font-extrabold uppercase">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center bg-amber-50/80 font-black text-base text-amber-950">
                        <div className="flex items-center justify-center min-h-[36px]">
                          <span>{s.totalWins} <span className="text-xs text-amber-800 font-bold">W</span></span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-700 font-bold">
                        {s.totalWins} - {s.totalLosses}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-800 font-bold">
                        {s.winPct}%
                      </td>
                      <td className="px-3 py-3 text-center">
                        {s.weeksWon > 0 ? (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-black text-xs">
                            🏆 {s.weeksWon}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-slate-700">
                        {s.bestWeek > 0 ? `${s.bestWeek} pts` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {Object.entries(s.weeklyBreakdown).map(([wk, data]: [string, any]) => (
                            <span 
                              key={wk} 
                              className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${
                                data.isWinner 
                                  ? 'bg-amber-400 text-amber-950 border-amber-500 font-black shadow-2xs' 
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                              title={`Week ${wk}: ${data.wins}W - ${data.losses}L ${data.isWinner ? '(Week Winner!)' : ''}`}
                            >
                              W{wk}: {data.wins}W
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: PARCHMENT & THEMED PICK SHEETS (Parchment, 49ers, Forest Green, Midnight Blue, Handwritten Pens & Blank Slips) */}
      {viewMode === 'sheets' && (
        <LegacyPickSheetViewer
          games={games}
          players={players}
          picks={picks}
          activePlayer={activePlayer}
          seasonHistory={seasonHistory}
        />
      )}
    </div>
  );
});

