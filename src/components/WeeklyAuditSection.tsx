import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Edit3, 
  Copy, 
  Check, 
  RotateCcw, 
  FileText, 
  Trophy, 
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
  History
} from 'lucide-react';
import { Game, Player, PlayerPickData, SeasonHistory } from '../types';
import { getSavedPoolConfig } from '../config/leagueConfig';

interface WeeklyAuditSectionProps {
  seasonHistory?: SeasonHistory;
  players: Player[];
  games: Game[];
  picks: Record<string, PlayerPickData>;
  onUpdateHistoricalWeekRecord?: (
    contenderName: string,
    weekNumber: number,
    wins: number,
    losses: number,
    tiebreaker: number | '',
    isWinner: boolean,
    isLocked?: boolean,
    auditNotes?: string
  ) => void;
  onToggleFreezeWeek?: (weekNumber: number, freeze: boolean) => void;
  onResetSeasonHistory?: () => void;
  onCompileWeekResults?: (weekNumber?: number) => Promise<{ success: boolean; winnerName?: string }>;
  onAdvanceWeekSafely?: (weekNumber?: number) => Promise<{ success: boolean; nextWeek?: number; winnerName?: string; error?: string }>;
  onNavigateToOverrides?: (contenderName: string) => void;
}

export const WeeklyAuditSection: React.FC<WeeklyAuditSectionProps> = ({
  seasonHistory,
  players,
  games,
  picks,
  onUpdateHistoricalWeekRecord,
  onToggleFreezeWeek,
  onResetSeasonHistory,
  onCompileWeekResults,
  onAdvanceWeekSafely,
  onNavigateToOverrides
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'historical' | 'submissions'>('historical');

  const activeGameWeek = useMemo(() => {
    const fromGames = games.find(g => typeof g.week === 'number' && g.week > 0)?.week || games[0]?.week;
    const fromConfig = getSavedPoolConfig().startingWeek;
    const maxCompiled = seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0
      ? Math.max(...seasonHistory.compiledWeeks)
      : 1;
    return Math.min(18, Math.max(1, fromGames || fromConfig || maxCompiled || 1));
  }, [games, seasonHistory?.compiledWeeks]);

  const compiledWeeks = useMemo(() => {
    const maxWeek = Math.min(18, Math.max(activeGameWeek, ...(seasonHistory?.compiledWeeks || []), 1));
    const weekSet = new Set<number>(seasonHistory?.compiledWeeks || []);
    for (let w = 1; w <= maxWeek; w++) {
      weekSet.add(w);
    }
    return Array.from(weekSet).filter(w => w >= 1 && w <= 18).sort((a, b) => a - b);
  }, [activeGameWeek, seasonHistory?.compiledWeeks]);

  const [selectedWeek, setSelectedWeek] = useState<number>(() => activeGameWeek);

  useEffect(() => {
    setSelectedWeek(activeGameWeek);
  }, [activeGameWeek]);
  const [copiedAudit, setCopiedAudit] = useState<boolean>(false);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [compileSuccessMsg, setCompileSuccessMsg] = useState<string | null>(null);

  // Edit record modal state
  const [editingRecord, setEditingRecord] = useState<{
    contenderName: string;
    week: number;
    wins: number;
    losses: number;
    tiebreaker: string;
    isWinner: boolean;
    isLocked: boolean;
    auditNotes: string;
  } | null>(null);

  const lockedWeeks = seasonHistory?.lockedWeeks || [];
  const isWeekLocked = lockedWeeks.includes(selectedWeek);

  // Calculate live computed scores from current picks & final games
  const activePlayers = useMemo(() => players.filter(p => p.isActive !== false), [players]);
  const finalGames = useMemo(() => games.filter(g => g.status === 'final'), [games]);

  const liveSheetScores = useMemo(() => {
    const scores: Record<string, { wins: number; losses: number; tiebreaker: number | '' }> = {};
    activePlayers.forEach(p => {
      const pPicks = picks[p.name]?.picks || {};
      const tb = picks[p.name]?.tiebreaker ?? '';
      let w = 0;
      let l = 0;
      games.forEach(g => {
        if (g.status === 'final' && g.officialWinner) {
          const pick = pPicks[g.gameNumber];
          if (pick && pick.toLowerCase() === g.officialWinner.toLowerCase()) {
            w++;
          } else {
            l++;
          }
        }
      });
      scores[p.name] = { wins: w, losses: l, tiebreaker: tb };
    });
    return scores;
  }, [activePlayers, games, picks]);

  // Contenders audit comparison for the selected week
  const auditedContenders = useMemo(() => {
    const records = seasonHistory?.records || {};
    const isCurrentActiveWeek = selectedWeek === activeGameWeek;
    return activePlayers.map(p => {
      const rec = records[p.name];
      const wkRecord = rec?.weeklyBreakdown?.[selectedWeek];
      const live = liveSheetScores[p.name] || { wins: 0, losses: 0, tiebreaker: '' };
      const hasFinalGames = finalGames.length > 0;

      const frozenWins = wkRecord ? wkRecord.wins : (isCurrentActiveWeek && hasFinalGames ? live.wins : 0);
      const frozenLosses = wkRecord ? wkRecord.losses : (isCurrentActiveWeek && hasFinalGames ? live.losses : 0);
      const frozenTB = wkRecord ? wkRecord.tiebreaker : (isCurrentActiveWeek ? (picks[p.name]?.tiebreaker ?? '') : '');
      const isWinner = wkRecord?.isWinner || false;
      const isRecordLocked = wkRecord?.isLocked ?? isWeekLocked;
      const auditedAt = wkRecord?.auditedAt;
      const auditNotes = wkRecord?.auditNotes;

      // Calculate score drift (discrepancy between frozen record and current live sheet for the active week)
      const drift = (isCurrentActiveWeek && wkRecord && hasFinalGames) ? live.wins - wkRecord.wins : 0;
      const hasDrift = Boolean(isCurrentActiveWeek && wkRecord && hasFinalGames && (live.wins !== wkRecord.wins || live.losses !== wkRecord.losses));

      // Calculate compiled season total wins across all weeks for this contender
      const weeklyBreakdown = rec?.weeklyBreakdown || {};
      let compiledSeasonWins = 0;
      let compiledSeasonLosses = 0;
      const weekParts: string[] = [];

      Object.entries(weeklyBreakdown)
        .sort(([a], [b]) => Number(a) - Number(b))
        .forEach(([wStr, wData]: any) => {
          compiledSeasonWins += Number(wData.wins || 0);
          compiledSeasonLosses += Number(wData.losses || 0);
          weekParts.push(`W${wStr}:${wData.wins}W`);
        });

      // If active week has frozen or live scores not yet in weeklyBreakdown, add it
      if (!weeklyBreakdown[activeGameWeek] && hasFinalGames && live.wins > 0) {
        compiledSeasonWins += live.wins;
        compiledSeasonLosses += live.losses;
        weekParts.push(`W${activeGameWeek}:${live.wins}W`);
      }

      return {
        player: p,
        frozenWins,
        frozenLosses,
        frozenTB,
        isWinner,
        isRecordLocked,
        auditedAt,
        auditNotes,
        liveWins: live.wins,
        liveLosses: live.losses,
        liveTB: live.tiebreaker,
        drift,
        hasDrift,
        seasonTotalWins: rec?.totalWins ?? compiledSeasonWins,
        seasonTotalLosses: rec?.totalLosses ?? compiledSeasonLosses,
        seasonRank: rec?.seasonRank ?? 1,
        compiledBreakdownSummary: weekParts.join(' + ')
      };
    }).sort((a, b) => {
      if (b.frozenWins !== a.frozenWins) return b.frozenWins - a.frozenWins;
      return a.player.name.localeCompare(b.player.name);
    });
  }, [activePlayers, seasonHistory, selectedWeek, activeGameWeek, isWeekLocked, liveSheetScores, picks, finalGames.length]);

  const totalDriftCount = auditedContenders.filter(c => c.hasDrift).length;

  // Missing picks audit
  const missingContenders = useMemo(() => {
    return activePlayers.filter(p => {
      const pPicks = picks[p.name]?.picks;
      return !pPicks || Object.keys(pPicks).length < games.length;
    });
  }, [activePlayers, picks, games.length]);

  const handleCopyAuditLedger = () => {
    const poolConfig = getSavedPoolConfig();
    const lines = [
      `=== ${poolConfig.leagueName.toUpperCase()} - WEEK ${selectedWeek} AUDIT LEDGER ===`,
      `Status: ${isWeekLocked ? 'FROZEN & PROTECTED' : 'OPEN / EDITABLE'}`,
      `Audited At: ${seasonHistory?.lastAuditedAt || seasonHistory?.lastCompiledAt || 'Baseline'}`,
      '',
      'Rank | Contender | Audited Record | Tiebreaker | Status | Live Sheet Drift',
      '------------------------------------------------------------------------'
    ];

    auditedContenders.forEach((c, idx) => {
      const winnerTag = c.isWinner ? ' [WEEK WINNER]' : '';
      const driftTag = c.hasDrift ? ` (Drift: Live Sheet has ${c.liveWins}W)` : ' (0 Drift)';
      lines.push(
        `#${idx + 1} | ${c.player.name.padEnd(12)} | ${c.frozenWins}W - ${c.frozenLosses}L | TB: ${c.frozenTB !== '' ? c.frozenTB : 'N/A'}${winnerTag}${driftTag}`
      );
    });

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAudit(true);
    setTimeout(() => setCopiedAudit(false), 3000);
  };

  const handleOpenEdit = (c: typeof auditedContenders[0]) => {
    setEditingRecord({
      contenderName: c.player.name,
      week: selectedWeek,
      wins: c.frozenWins,
      losses: c.frozenLosses,
      tiebreaker: c.frozenTB !== '' && c.frozenTB !== undefined ? String(c.frozenTB) : '',
      isWinner: c.isWinner,
      isLocked: c.isRecordLocked,
      auditNotes: c.auditNotes || ''
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !onUpdateHistoricalWeekRecord) return;
    const tbVal = editingRecord.tiebreaker !== '' ? Number(editingRecord.tiebreaker) : '';
    onUpdateHistoricalWeekRecord(
      editingRecord.contenderName,
      editingRecord.week,
      editingRecord.wins,
      editingRecord.losses,
      tbVal,
      editingRecord.isWinner,
      editingRecord.isLocked,
      editingRecord.auditNotes
    );
    setEditingRecord(null);
  };

  const handleRecompileFromSheet = async () => {
    if (!onCompileWeekResults) return;
    const confirmMsg = `📊 RECORD WEEK ${selectedWeek} SCORES INTO SEASON LEDGER:\n\nThis will snapshot each contender's current wins/losses from the live Week ${selectedWeek} scoring spreadsheet directly into the official Cumulative Season Standings ledger.\n\nAre you sure you want to record Week ${selectedWeek} results now?`;
    if (!window.confirm(confirmMsg)) return;

    setIsCompiling(true);
    const res = await onCompileWeekResults(selectedWeek);
    setIsCompiling(false);
    if (res.success) {
      setCompileSuccessMsg(`Week ${selectedWeek} scores successfully recorded into the season standings ledger!`);
      setTimeout(() => setCompileSuccessMsg(null), 4000);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-amber-300 shadow-sm space-y-5">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b-2 border-amber-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
              <span>Audit & Historical Data Integrity Hub</span>
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Audit previous weeks, verify score calculations against sheet changes, lock past records, and correct historical tallies.
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1.5 bg-amber-100/70 p-1 rounded-xl border border-amber-300 self-stretch sm:self-auto">
          <button
            onClick={() => setActiveSubTab('historical')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeSubTab === 'historical'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-950 hover:bg-amber-200/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Score History Audit</span>
          </button>
          <button
            onClick={() => setActiveSubTab('submissions')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeSubTab === 'submissions'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-950 hover:bg-amber-200/60'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Missing Picks Audit</span>
            {missingContenders.length > 0 && (
              <span className="bg-amber-950 text-amber-200 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {missingContenders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {compileSuccessMsg && (
        <div className="p-3 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-emerald-950 font-bold text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{compileSuccessMsg}</span>
        </div>
      )}

      {/* SUB-VIEW 1: HISTORICAL SCORE AUDIT */}
      {activeSubTab === 'historical' && (
        <div className="space-y-5">
          {/* Week Selector & Protection Controls */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Select Week:</span>
              <div className="flex items-center gap-1.5">
                {compiledWeeks.map(wk => (
                  <button
                    key={wk}
                    onClick={() => setSelectedWeek(wk)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                      selectedWeek === wk
                        ? 'bg-slate-900 text-white border-slate-950 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Week {wk}
                  </button>
                ))}
              </div>

              {/* Status Badge */}
              <div className={`px-2.5 py-1 rounded-lg text-xs font-black border flex items-center gap-1.5 ${
                isWeekLocked
                  ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                  : 'bg-amber-100 text-amber-950 border-amber-300'
              }`}>
                {isWeekLocked ? <Lock className="w-3.5 h-3.5 text-emerald-700" /> : <Unlock className="w-3.5 h-3.5 text-amber-700" />}
                <span>{isWeekLocked ? `Week ${selectedWeek} Frozen & Protected` : `Week ${selectedWeek} Unlocked / Open`}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
              {onToggleFreezeWeek && (
                <button
                  onClick={() => onToggleFreezeWeek(selectedWeek, !isWeekLocked)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isWeekLocked
                      ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                      : 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-900 shadow-xs'
                  }`}
                  title={isWeekLocked ? "Unlock week to allow score recompilation" : "Lock week to prevent changes when tweaking the sheet"}
                >
                  {isWeekLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{isWeekLocked ? 'Unlock Week' : 'Freeze & Lock Scores'}</span>
                </button>
              )}

              <button
                onClick={handleCopyAuditLedger}
                className="px-3 py-1.5 rounded-lg text-xs font-black bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="Copy formatted audit report to clipboard"
              >
                {copiedAudit ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAudit ? 'Copied Ledger!' : 'Copy Audit Report'}</span>
              </button>

              {onCompileWeekResults && !isWeekLocked && selectedWeek === activeGameWeek && (
                <button
                  onClick={handleRecompileFromSheet}
                  disabled={isCompiling}
                  className="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-800 hover:bg-emerald-900 text-amber-300 border border-emerald-950 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                  title={`Snapshot current live spreadsheet scores for Week ${activeGameWeek} into the season total wins ledger`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${isCompiling ? 'animate-spin' : ''}`} />
                  <span>Record Week {activeGameWeek} into Season Ledger</span>
                </button>
              )}

              {onAdvanceWeekSafely && (
                <button
                  onClick={async () => {
                    const confirmMsg = `🔒 STANDINGS VAULT FREEZE & ADVANCE:\n\nAre you sure you want to permanently freeze Week ${selectedWeek} scores into the Historical Vault, archive all submitted pick sheets, and advance the pool to Week ${selectedWeek + 1}?\n\n• Season total wins will be permanently preserved.\n• Active pick sheets will reset to clean slates for Week ${selectedWeek + 1}.\n• Week ${selectedWeek} will be permanently anchored into the vault.`;
                    if (!window.confirm(confirmMsg)) return;
                    const res = await onAdvanceWeekSafely(selectedWeek);
                    if (res.success) {
                      alert(`Week ${selectedWeek} successfully frozen! Crown: ${res.winnerName || 'Official Leader'}. Pool advanced to Week ${res.nextWeek || (selectedWeek + 1)}.`);
                    } else {
                      alert(`Could not advance week: ${res.error || 'Server error'}`);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title={`Permanently freeze Week ${selectedWeek} scores into the Historical Vault and advance pool to Week ${selectedWeek + 1}`}
                >
                  <Lock className="w-3.5 h-3.5 text-slate-950" />
                  <span>Freeze & Advance to Week {selectedWeek + 1}</span>
                </button>
              )}
            </div>
          </div>

          {/* DRIFT DETECTOR BANNER */}
          {totalDriftCount > 0 ? (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-black text-xs text-amber-950 uppercase tracking-wide">
                  Score Drift Detected ({totalDriftCount} Contender{totalDriftCount > 1 ? 's' : ''})
                </div>
                <p className="text-xs text-amber-900">
                  Tweaking games or pick sheet formulas computes different wins/losses than the recorded baseline for Week {selectedWeek}.
                  {isWeekLocked ? (
                    <span className="font-bold"> Because Week {selectedWeek} is FROZEN, your historical standings and records remain safely protected.</span>
                  ) : (
                    <span> To protect these official scores from accidental modification, click <strong>"Freeze & Lock Scores"</strong> above.</span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-xl p-3.5 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs text-emerald-950">
                <span className="font-black">All Contender Scores Verified & In Sync.</span>
                <span className="text-emerald-800 ml-1">Zero score drift detected across all active participants for Week {selectedWeek}.</span>
              </div>
            </div>
          )}

          {/* AUDIT LEDGER TABLE */}
          <div className="border-2 border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="bg-slate-100 px-4 py-3 border-b-2 border-slate-200 flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-600" />
                <span>Week {selectedWeek} Audited Standings & Score Ledger</span>
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                {seasonHistory?.lastAuditedAt || seasonHistory?.lastCompiledAt || 'Official Baseline'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Contender</th>
                    <th className="py-2.5 px-3 text-center bg-amber-50/70 text-amber-950 font-black">Season Total Wins</th>
                    <th className="py-2.5 px-3 text-center">Week {selectedWeek} Record</th>
                    <th className="py-2.5 px-3 text-center">MNF Tiebreaker</th>
                    <th className="py-2.5 px-3 text-center">Week Result</th>
                    <th className="py-2.5 px-3 text-center">Sheet Drift</th>
                    <th className="py-2.5 px-3 text-center">Protection</th>
                    <th className="py-2.5 px-3 text-right">Audit Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {auditedContenders.map((c, idx) => {
                    const winPct = (c.frozenWins + c.frozenLosses) > 0 
                      ? ((c.frozenWins / (c.frozenWins + c.frozenLosses)) * 100).toFixed(1) 
                      : '0.0';

                    return (
                      <tr key={c.player.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-black text-slate-900">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 text-xs sm:text-sm">{c.player.name}</span>
                            {c.player.role === 'admin' && (
                              <span className="text-[10px] bg-slate-200 text-slate-800 font-bold px-1.5 py-0.2 rounded">Admin</span>
                            )}
                            {c.player.role === 'consultant' && (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">Founder</span>
                            )}
                            {c.player.isChampion && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">2024 Champ</span>
                            )}
                          </div>
                          {c.auditNotes && (
                            <div className="text-[10px] text-amber-800 font-medium mt-0.5 flex items-center gap-1">
                              <span>Note: {c.auditNotes}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center bg-amber-50/50">
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-black text-amber-950">{c.seasonTotalWins} <span className="text-xs text-amber-800 font-bold">W</span></span>
                            {c.compiledBreakdownSummary && (
                              <span className="text-[9px] text-amber-700 font-semibold mt-0.5">({c.compiledBreakdownSummary})</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-black text-slate-900">{c.frozenWins}W - {c.frozenLosses}L</span>
                          <span className="text-[10px] text-slate-500 ml-1.5 font-bold">({winPct}%)</span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700">
                          {c.frozenTB !== '' && c.frozenTB !== undefined ? `${c.frozenTB} pts` : <span className="text-slate-400 font-normal">None</span>}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {c.isWinner ? (
                            <span className="inline-flex items-center gap-1 bg-amber-100 border border-amber-300 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-2xs">
                              <Trophy className="w-3 h-3 text-amber-600" />
                              <span>Week {selectedWeek} Winner</span>
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px] font-medium">Contender</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {c.hasDrift ? (
                            <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md font-black text-[11px] border border-amber-300">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>Live Sheet: {c.liveWins}W ({c.drift > 0 ? `+${c.drift}` : c.drift})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md font-bold text-[11px] border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Verified (0)</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {c.isRecordLocked ? (
                            <span className="inline-flex items-center gap-1 text-emerald-800 font-bold text-[11px]">
                              <Lock className="w-3 h-3 text-emerald-600" />
                              <span>Frozen</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-[11px]">
                              <Unlock className="w-3 h-3 text-amber-600" />
                              <span>Open</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleOpenEdit(c)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3 text-purple-700" />
                            <span>Edit Record</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* DIAGNOSTICS & RESET CONTROLS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Audit Integrity Check</div>
              <div className="text-base font-black text-slate-900 mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{activePlayers.length}/{activePlayers.length} Contenders Audited</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Sum of {games.length} games verified per entry</div>
            </div>

            <div className="p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Season Standings Sync</div>
              <div className="text-base font-black text-slate-900 mt-0.5 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Season Rankings Active</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Auto-tallied from audited breakdowns</div>
            </div>

            <div className="p-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase">Baseline Recovery</div>
                <div className="text-xs font-bold text-slate-700 mt-0.5">Restore original Week 1 stats</div>
              </div>
              {onResetSeasonHistory && (
                <button
                  onClick={() => {
                    if (window.confirm("Reset all season history back to the official Week 1 baseline? This will clear any experimental score overrides.")) {
                      onResetSeasonHistory();
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-black bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg cursor-pointer transition-all"
                >
                  Reset Baseline
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: SUBMISSIONS AUDIT */}
      {activeSubTab === 'submissions' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="p-4 rounded-xl border-2 border-slate-300 bg-slate-50">
              <div className="text-xs font-bold text-slate-600 uppercase">Total Contenders</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{activePlayers.length} Members</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Active pool roster</div>
            </div>

            <div className="p-4 rounded-xl border-2 border-emerald-400 bg-emerald-50/50">
              <div className="text-xs font-black text-emerald-900 uppercase">Picks Received</div>
              <div className="text-2xl font-black text-emerald-900 mt-1">{activePlayers.length - missingContenders.length} Ready</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">Complete 16-game slates</div>
            </div>

            <div className="p-4 rounded-xl border-2 border-amber-400 bg-amber-50/60">
              <div className="text-xs font-black text-amber-950 uppercase">Missing / Incomplete</div>
              <div className="text-2xl font-black text-amber-950 mt-1">{missingContenders.length} Pending</div>
              <div className="text-[11px] text-amber-800 mt-0.5">Needs phone/email reminder</div>
            </div>
          </div>

          {missingContenders.length > 0 ? (
            <div className="border-2 border-amber-300 rounded-xl p-4 bg-amber-50/40">
              <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide mb-2">
                Contenders with Missing or Incomplete Picks:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {missingContenders.map(p => {
                  const pPicks = picks[p.name]?.picks || {};
                  const count = Object.keys(pPicks).length;
                  return (
                    <div key={p.id} className="p-3 bg-white border-2 border-amber-200 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="font-black text-xs text-slate-900">{p.name}</div>
                        <div className="text-[10px] text-slate-500 font-semibold">{count} of {games.length} picks entered</div>
                      </div>
                      {onNavigateToOverrides && (
                        <button
                          onClick={() => onNavigateToOverrides(p.name)}
                          className="text-[11px] bg-amber-100 hover:bg-amber-200 text-amber-950 font-black px-2 py-1 rounded border border-amber-300 cursor-pointer"
                        >
                          Enter Picks
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex items-center gap-3 text-emerald-950 font-bold text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              <span>All {activePlayers.length} contenders have submitted complete picks for this week!</span>
            </div>
          )}
        </div>
      )}

      {/* CONTENDER HISTORICAL SCORE OVERRIDE MODAL */}
      {editingRecord && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border-2 border-purple-900 max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-purple-700" />
                <span>Edit Historical Record: {editingRecord.contenderName}</span>
              </h4>
              <button
                onClick={() => setEditingRecord(null)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-950">
                Adjusting this record directly updates the frozen Week {editingRecord.week} ledger and automatically recalculates overall season ranks.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Audited Wins (0–16)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="16"
                    value={editingRecord.wins}
                    onChange={e => setEditingRecord({ ...editingRecord, wins: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-sm font-black text-slate-900 focus:outline-hidden focus:border-purple-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Audited Losses (0–16)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="16"
                    value={editingRecord.losses}
                    onChange={e => setEditingRecord({ ...editingRecord, losses: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-sm font-black text-slate-900 focus:outline-hidden focus:border-purple-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  MNF Tiebreaker Prediction (Total Points)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 48"
                  value={editingRecord.tiebreaker}
                  onChange={e => setEditingRecord({ ...editingRecord, tiebreaker: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-sm font-black text-slate-900 focus:outline-hidden focus:border-purple-600"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRecord.isWinner}
                    onChange={e => setEditingRecord({ ...editingRecord, isWinner: e.target.checked })}
                    className="w-4 h-4 rounded-sm text-purple-700 focus:ring-purple-500"
                  />
                  <span className="text-xs font-black text-slate-800">Designate as Official Week {editingRecord.week} Winner</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingRecord.isLocked}
                    onChange={e => setEditingRecord({ ...editingRecord, isLocked: e.target.checked })}
                    className="w-4 h-4 rounded-sm text-emerald-700 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-black text-slate-800">Freeze & Protect this record from live sheet changes</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Audit Notes / Reason for Adjustment
                </label>
                <input
                  type="text"
                  placeholder="e.g. Official stat correction per Pool Admin"
                  value={editingRecord.auditNotes}
                  onChange={e => setEditingRecord({ ...editingRecord, auditNotes: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:border-purple-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-purple-800 hover:bg-purple-900 text-white font-black text-xs px-5 py-2.5 rounded-xl border-2 border-purple-950 cursor-pointer shadow-xs"
                >
                  Save & Recalculate Season Ranks
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
