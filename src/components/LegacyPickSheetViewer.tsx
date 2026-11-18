import React, { useState, useEffect, useMemo, memo } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  Calendar
} from 'lucide-react';
import { Game, Player, PlayerPickData, SeasonHistory } from '../types';
import { isGameTie } from '../utils/nflTieEngine';
import { getSavedPoolConfig } from '../config/leagueConfig';

export type SheetTheme = 
  | 'classic_bw'
  | 'original_forest' 
  | 'crimson_gold'
  | 'midnight_silver'
  | 'navy_orange'
  | 'steel_gold'
  | 'royal_red'
  | 'aqua_orange'
  | 'silver_black';

export type SheetLayout = 'vertical_matrix' | 'horizontal_ledger' | 'blank_takehome';

interface LegacyPickSheetViewerProps {
  games: Game[];
  players: Player[];
  picks: Record<string, PlayerPickData>;
  activePlayer?: Player | null;
  seasonHistory?: SeasonHistory;
}

export const LegacyPickSheetViewer: React.FC<LegacyPickSheetViewerProps> = memo(({
  games,
  players,
  picks,
  activePlayer,
  seasonHistory
}) => {
  // Theme and Layout Options: default to clean Black & White for print perfection, or classic Forest Green
  const [selectedTheme, setSelectedTheme] = useState<SheetTheme>('classic_bw');
  const [selectedLayout, setSelectedLayout] = useState<SheetLayout>('vertical_matrix');
  const [highlightContender, setHighlightContender] = useState<string>('all');
  const [isBwPrintMode, setIsBwPrintMode] = useState<boolean>(true);

  // Latest compiled week and reigning weekly winner
  const latestCompiledWeek = seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0 
    ? Math.max(...seasonHistory.compiledWeeks) 
    : 1;
  const currentActiveWeek = (games && games.length > 0 && (games[0] as any).week)
    ? (games[0] as any).week
    : (latestCompiledWeek + 1);

  // Blank Pick Sheet: allow user to select current or any upcoming week for printing
  const [selectedPrintWeek, setSelectedPrintWeek] = useState<number>(currentActiveWeek);
  const [scheduledGamesForWeek, setScheduledGamesForWeek] = useState<Game[]>(games);
  const [isLoadingFutureWeek, setIsLoadingFutureWeek] = useState<boolean>(false);

  useEffect(() => {
    setSelectedPrintWeek(currentActiveWeek);
    setScheduledGamesForWeek(games);
  }, [currentActiveWeek, games]);

  // Fetch upcoming week games dynamically when user picks a future week for blank printing
  useEffect(() => {
    if (selectedPrintWeek === currentActiveWeek) {
      setScheduledGamesForWeek(games);
      return;
    }
    let isCancelled = false;
    setIsLoadingFutureWeek(true);
    fetch(`/api/schedule/week/${selectedPrintWeek}`)
      .then(r => r.json())
      .then(data => {
        if (!isCancelled && data.success && Array.isArray(data.games)) {
          setScheduledGamesForWeek(data.games);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsLoadingFutureWeek(false);
      });

    return () => { isCancelled = true; };
  }, [selectedPrintWeek, currentActiveWeek, games]);

  // Filter to active players and sort sequentially by season total wins (descending)
  const activePlayers = useMemo(() => {
    const list = players.filter(p => p.isActive !== false);
    if (!seasonHistory?.records) return list;
    return [...list].sort((a, b) => {
      const aWins = seasonHistory.records[a.name]?.totalWins ?? 0;
      const bWins = seasonHistory.records[b.name]?.totalWins ?? 0;
      if (bWins !== aWins) return bWins - aWins;
      return a.name.localeCompare(b.name);
    });
  }, [players, seasonHistory]);

  // 8 Popular NFL Themes + Black & White Print Default
  const themeStyles: Record<SheetTheme, {
    id: SheetTheme;
    name: string;
    containerBg: string;
    borderColor: string;
    headerBg: string;
    headerText: string;
    headerSubBg: string;
    tableHeaderBg: string;
    tableHeaderText: string;
    winnerCellBg: string;
    winnerCellBody: string;
    accentBorder: string;
    fontClass: string;
    tableBorder: string;
    rowHover: string;
  }> = {
    classic_bw: {
      id: 'classic_bw',
      name: "Crisp Black & White (Print Default)",
      containerBg: 'bg-white',
      borderColor: 'border-slate-900',
      headerBg: 'bg-slate-900',
      headerText: 'text-white',
      headerSubBg: 'bg-slate-800',
      tableHeaderBg: 'bg-slate-900',
      tableHeaderText: 'text-white',
      winnerCellBg: 'bg-slate-950 text-white font-black',
      winnerCellBody: 'text-slate-950 font-black bg-slate-100 border border-slate-400',
      accentBorder: 'border-slate-800',
      fontClass: 'font-sans',
      tableBorder: 'border-slate-300',
      rowHover: 'hover:bg-slate-50'
    },
    original_forest: {
      id: 'original_forest',
      name: "Forest Green & Gold (Classic)",
      containerBg: 'bg-[#f4f8f5]',
      borderColor: 'border-[#1b3a2b]',
      headerBg: 'bg-[#1b3a2b]',
      headerText: 'text-emerald-50',
      headerSubBg: 'bg-[#142e22]',
      tableHeaderBg: 'bg-[#0d2317]',
      tableHeaderText: 'text-emerald-100',
      winnerCellBg: 'bg-[#09170f] text-amber-300',
      winnerCellBody: 'text-emerald-950 font-black bg-emerald-100 border border-emerald-400',
      accentBorder: 'border-[#1b3a2b]',
      fontClass: 'font-sans',
      tableBorder: 'border-emerald-800/40',
      rowHover: 'hover:bg-emerald-100/50'
    },
    crimson_gold: {
      id: 'crimson_gold',
      name: "Crimson & Gold (49ers / Chiefs)",
      containerBg: 'bg-[#fffaf2]',
      borderColor: 'border-[#b3995d]',
      headerBg: 'bg-gradient-to-r from-[#820000] via-[#aa0000] to-[#6d0000]',
      headerText: 'text-[#fff8e7]',
      headerSubBg: 'bg-[#6d0000]',
      tableHeaderBg: 'bg-[#660000]',
      tableHeaderText: 'text-[#ffd700]',
      winnerCellBg: 'bg-[#400000] text-[#ffd700]',
      winnerCellBody: 'text-[#aa0000] font-black bg-amber-100/95 border border-[#b3995d]',
      accentBorder: 'border-[#b3995d]',
      fontClass: 'font-sans',
      tableBorder: 'border-[#b3995d]/60',
      rowHover: 'hover:bg-amber-100/60'
    },
    midnight_silver: {
      id: 'midnight_silver',
      name: "Midnight Green & Silver (Eagles)",
      containerBg: 'bg-[#f0fdf4]',
      borderColor: 'border-[#004C54]',
      headerBg: 'bg-[#004C54]',
      headerText: 'text-white',
      headerSubBg: 'bg-[#00343a]',
      tableHeaderBg: 'bg-[#002b30]',
      tableHeaderText: 'text-[#A5ACAF]',
      winnerCellBg: 'bg-[#002226] text-emerald-300',
      winnerCellBody: 'text-[#004C54] font-black bg-emerald-50 border border-[#004C54]',
      accentBorder: 'border-[#004C54]',
      fontClass: 'font-sans',
      tableBorder: 'border-emerald-800/30',
      rowHover: 'hover:bg-emerald-50'
    },
    navy_orange: {
      id: 'navy_orange',
      name: "Navy Blue & Burnt Orange (Bears / Broncos)",
      containerBg: 'bg-[#f8fafc]',
      borderColor: 'border-[#0B162A]',
      headerBg: 'bg-[#0B162A]',
      headerText: 'text-white',
      headerSubBg: 'bg-[#060D19]',
      tableHeaderBg: 'bg-[#0B162A]',
      tableHeaderText: 'text-[#FB4F14]',
      winnerCellBg: 'bg-[#060D19] text-[#FB4F14]',
      winnerCellBody: 'text-[#0B162A] font-black bg-orange-50 border border-orange-400',
      accentBorder: 'border-[#C83803]',
      fontClass: 'font-sans',
      tableBorder: 'border-slate-300',
      rowHover: 'hover:bg-orange-50/50'
    },
    steel_gold: {
      id: 'steel_gold',
      name: "Steel Black & Gold (Steelers)",
      containerBg: 'bg-[#fafaf9]',
      borderColor: 'border-black',
      headerBg: 'bg-[#101820]',
      headerText: 'text-[#FFB612]',
      headerSubBg: 'bg-black',
      tableHeaderBg: 'bg-black',
      tableHeaderText: 'text-[#FFB612]',
      winnerCellBg: 'bg-black text-[#FFB612]',
      winnerCellBody: 'text-black font-black bg-amber-100 border border-amber-400',
      accentBorder: 'border-[#FFB612]',
      fontClass: 'font-sans',
      tableBorder: 'border-slate-300',
      rowHover: 'hover:bg-amber-50'
    },
    royal_red: {
      id: 'royal_red',
      name: "Royal Blue & Red (Bills / Giants)",
      containerBg: 'bg-[#eff6ff]',
      borderColor: 'border-[#00338D]',
      headerBg: 'bg-[#00338D]',
      headerText: 'text-white',
      headerSubBg: 'bg-[#00225A]',
      tableHeaderBg: 'bg-[#00225A]',
      tableHeaderText: 'text-[#C60C30]',
      winnerCellBg: 'bg-[#001c4a] text-white',
      winnerCellBody: 'text-[#00338D] font-black bg-blue-50 border border-blue-400',
      accentBorder: 'border-[#C60C30]',
      fontClass: 'font-sans',
      tableBorder: 'border-blue-200',
      rowHover: 'hover:bg-blue-50'
    },
    aqua_orange: {
      id: 'aqua_orange',
      name: "Aqua & Solar Orange (Dolphins)",
      containerBg: 'bg-[#f0fdfa]',
      borderColor: 'border-[#008E97]',
      headerBg: 'bg-[#008E97]',
      headerText: 'text-white',
      headerSubBg: 'bg-[#00575d]',
      tableHeaderBg: 'bg-[#00575d]',
      tableHeaderText: 'text-[#FC4C02]',
      winnerCellBg: 'bg-[#00474c] text-white',
      winnerCellBody: 'text-[#00575d] font-black bg-teal-50 border border-teal-400',
      accentBorder: 'border-[#FC4C02]',
      fontClass: 'font-sans',
      tableBorder: 'border-teal-200',
      rowHover: 'hover:bg-teal-50'
    },
    silver_black: {
      id: 'silver_black',
      name: "Silver & Raider Black (Raiders)",
      containerBg: 'bg-[#f8fafc]',
      borderColor: 'border-black',
      headerBg: 'bg-black',
      headerText: 'text-[#A5ACAF]',
      headerSubBg: 'bg-[#18181b]',
      tableHeaderBg: 'bg-black',
      tableHeaderText: 'text-[#A5ACAF]',
      winnerCellBg: 'bg-black text-[#A5ACAF]',
      winnerCellBody: 'text-black font-black bg-slate-100 border border-slate-400',
      accentBorder: 'border-[#A5ACAF]',
      fontClass: 'font-sans',
      tableBorder: 'border-slate-300',
      rowHover: 'hover:bg-slate-100'
    }
  };

  const theme = themeStyles[selectedTheme] || themeStyles.classic_bw;

  // Print function: Sets document title dynamically so browser "Save as PDF" names the file accurately
  const handlePrint = (mode: 'matrix' | 'blank') => {
    const prevTitle = document.title;
    if (mode === 'blank') {
      document.title = `Week ${selectedPrintWeek} Pick Sheet`;
      document.body.classList.add('print-portrait');
    } else {
      document.title = `Week ${currentActiveWeek} Scoring Spreadsheet`;
      document.body.classList.remove('print-portrait');
    }

    if (isBwPrintMode) {
      document.body.classList.add('print-bw');
    } else {
      document.body.classList.remove('print-bw');
    }

    window.print();

    // Restore title and classes after print dialog opens
    setTimeout(() => {
      document.title = prevTitle;
      document.body.classList.remove('print-portrait', 'print-bw');
    }, 1000);
  };

  const poolCfg = getSavedPoolConfig();

  return (
    <div id="legacy-pick-sheet-container" className="mb-8 space-y-4">
      {/* CONTROL & PREFERENCE BAR (Hidden when printing) */}
      <div className="bg-white rounded-xl border border-slate-300 p-3.5 shadow-2xs space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Pick Sheets &amp; Printable Exports
              </h3>
              <p className="text-xs text-slate-500">
                High-contrast printable sheets, blank contender ballots, &amp; NFL team color themes
              </p>
            </div>
          </div>

          {/* Quick Print & Download Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isBwPrintMode}
                onChange={e => setIsBwPrintMode(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-slate-900 focus:ring-slate-900"
              />
              <span>Black &amp; White Print</span>
            </label>

            <button
              onClick={() => handlePrint(selectedLayout === 'blank_takehome' ? 'blank' : 'matrix')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer shadow-xs transition-all active:scale-95"
              title="Print directly or save cleanly to PDF"
            >
              <Printer className="w-3.5 h-3.5 text-amber-300" />
              <span>{selectedLayout === 'blank_takehome' ? `Print Week ${selectedPrintWeek} Blank Sheet` : 'Print Sheet to PDF'}</span>
            </button>
          </div>
        </div>

        {/* THEME SELECTOR PILLS */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Pick Sheet Color Theme:
            </span>
            <span className="text-[10px] text-slate-400">Defaults to Black &amp; White on paper</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.values(themeStyles).map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTheme(t.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedTheme === t.id
                    ? 'bg-slate-950 text-white border-slate-950 shadow-xs ring-2 ring-amber-400'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
              >
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* LAYOUT SELECTOR */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
              View Format:
            </span>
            <div className="inline-flex rounded-lg p-1 bg-slate-100 border border-slate-300 flex-wrap">
              <button
                onClick={() => setSelectedLayout('vertical_matrix')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  selectedLayout === 'vertical_matrix'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-300 font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Vertical Sheet (Games ↓)
              </button>
              <button
                onClick={() => setSelectedLayout('horizontal_ledger')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  selectedLayout === 'horizontal_ledger'
                    ? 'bg-white text-slate-900 shadow-2xs border border-slate-300 font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Horizontal Ledger (Contenders ↓)
              </button>
              <button
                onClick={() => setSelectedLayout('blank_takehome')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  selectedLayout === 'blank_takehome'
                    ? 'bg-amber-400 text-slate-950 shadow-2xs border border-amber-500 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📝 Blank Take-Home Pick Sheet
              </button>
            </div>
          </div>

          {/* Conditional Controls based on Layout */}
          {selectedLayout === 'blank_takehome' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-800" />
                <span>Select Week:</span>
              </span>
              <select
                value={selectedPrintWeek}
                onChange={e => setSelectedPrintWeek(Number(e.target.value))}
                className="bg-white border-2 border-emerald-700 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                {Array.from({ length: 18 - currentActiveWeek + 1 }, (_, i) => currentActiveWeek + i).map(w => (
                  <option key={w} value={w}>
                    Week {w} {w === currentActiveWeek ? '(Current)' : '(Upcoming)'}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Highlight:</span>
              <select
                value={highlightContender}
                onChange={(e) => setHighlightContender(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-700"
              >
                <option value="all">All Contenders</option>
                {activePlayers.map(p => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* THE ACTUAL PICK SHEET CONTAINER */}
      <div 
        id="printable-sheet-surface"
        className={`relative rounded-xl border-2 ${theme.borderColor} ${theme.containerBg} overflow-hidden shadow-sm transition-all`}
      >
        {/* SHEET HEADER BANNER */}
        <div className={`p-4 ${theme.headerBg} ${theme.headerText} border-b-2 ${theme.accentBorder} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base sm:text-lg font-black tracking-tight">
                {selectedLayout === 'blank_takehome'
                  ? `${poolCfg.leagueName.toUpperCase()} • WEEK ${selectedPrintWeek} OFFICIAL SELECTION SHEET`
                  : `${poolCfg.leagueName.toUpperCase()} • WEEK ${currentActiveWeek} MASTER SCORING SHEET`}
              </h4>
              <span className="px-2 py-0.5 rounded text-xs font-black bg-amber-400 text-slate-950">
                {selectedLayout === 'blank_takehome' ? `Week ${selectedPrintWeek}` : `Week ${currentActiveWeek} Master`}
              </span>
            </div>
            <div className="text-xs opacity-90 flex flex-wrap items-center gap-3 mt-1 font-medium">
              <span>{poolCfg.associationName}</span>
              <span>•</span>
              <span>Straight-Up Picks • 1 Pt Per Win</span>
              <span>•</span>
              <span>Tiebreaker: Total Combined Monday Night Points</span>
            </div>
          </div>

          <div className="text-right text-xs opacity-90 hidden sm:block">
            <div className="font-bold">100% Proceeds to Umpire Gear Locker</div>
            <div className="text-[11px] opacity-75">Pool Admin: {poolCfg.adminName}</div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* LAYOUT 1: VERTICAL GRID (Games Down Left, Contenders Top)     */}
        {/* ------------------------------------------------------------- */}
        {selectedLayout === 'vertical_matrix' && (
          <div className="overflow-x-auto contain-content" style={{ contain: 'content' }}>
            <table className={`w-full text-xs text-left border-collapse min-w-[1100px] ${theme.fontClass}`}>
              <thead>
                <tr className={`${theme.tableHeaderBg} ${theme.tableHeaderText}`}>
                  <th className={`sticky left-0 z-20 ${theme.tableHeaderBg} px-3 py-3 font-bold border-r ${theme.accentBorder} min-w-[65px]`}>
                    Game #
                  </th>
                  <th className={`sticky left-[65px] z-20 ${theme.tableHeaderBg} px-3 py-3 font-bold border-r ${theme.accentBorder} min-w-[155px]`}>
                    Matchup &amp; Kickoff
                  </th>
                  <th className={`px-3 py-3 font-bold border-r ${theme.accentBorder} text-center min-w-[90px]`}>
                    Winner
                  </th>

                  {activePlayers.map(player => {
                    const isSelected = highlightContender === player.name;
                    return (
                      <th 
                        key={player.id}
                        className={`px-3 py-3 font-bold border-r ${theme.accentBorder} text-center min-w-[105px] ${
                          isSelected ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300' : ''
                        }`}
                      >
                        <div className="truncate max-w-[100px] mx-auto" title={player.name}>
                          {player.name}
                        </div>
                        {player.role === 'admin' && (
                          <div className="text-[9px] font-bold text-amber-300">Admin</div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {games.map((game, gIdx) => {
                  const hasWinner = Boolean(game.officialWinner && game.status === 'final');
                  const isTie = isGameTie(game);

                  return (
                    <tr 
                      key={game.gameNumber}
                      className={`border-b ${theme.tableBorder} ${gIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} ${theme.rowHover} transition-colors`}
                    >
                      <td className={`sticky left-0 z-10 ${gIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} px-3 py-2.5 font-bold border-r ${theme.tableBorder} text-center text-slate-700`}>
                        {game.gameNumber}
                      </td>

                      <td className={`sticky left-[65px] z-10 ${gIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} px-3 py-2.5 border-r ${theme.tableBorder}`}>
                        <div className="font-bold text-slate-900 leading-tight">
                          {game.awayTeam} <span className="text-slate-400 font-normal">@</span> {game.homeTeam}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {game.day} • {game.kickoffTime} {game.isMNF ? '★ MNF' : ''}
                        </div>
                      </td>

                      <td className={`px-2 py-2.5 text-center border-r ${theme.tableBorder} font-bold`}>
                        {hasWinner ? (
                          <span className="text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px] font-black">
                            {game.officialWinner}
                          </span>
                        ) : isTie ? (
                          <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[11px] font-black">
                            TIE (0 Pts)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">
                            {game.status === 'in_progress' ? 'Live' : 'Scheduled'}
                          </span>
                        )}
                      </td>

                      {activePlayers.map(player => {
                        const pick = picks[player.name]?.picks?.[game.gameNumber];
                        const isAutoDefault = picks[player.name]?.autoDefaultGames?.includes(game.gameNumber);
                        const isWinner = hasWinner && pick && pick.toLowerCase() === game.officialWinner?.toLowerCase();
                        const isLoser = hasWinner && pick && pick.toLowerCase() !== game.officialWinner?.toLowerCase();
                        const isSelected = highlightContender === player.name;

                        return (
                          <td 
                            key={player.id}
                            className={`px-2 py-2.5 text-center border-r ${theme.tableBorder} ${
                              isSelected ? 'bg-amber-50/80 font-black' : ''
                            } ${
                              isWinner ? 'bg-emerald-100/80 text-emerald-950 font-black' :
                              isLoser ? 'bg-rose-50/60 text-rose-700' : ''
                            }`}
                          >
                            {pick ? (
                              <span className="font-bold text-slate-900 inline-flex items-center justify-center gap-0.5">
                                {isAutoDefault && <span className="text-[9px] text-amber-700 font-bold" title="Auto-assigned Vegas Favorite at kickoff (Dad's Rule)">🤖</span>}
                                <span>{pick}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* TIEBREAKER ROW */}
                <tr className="bg-amber-50/90 border-t-2 border-amber-400 font-bold">
                  <td colSpan={2} className="sticky left-0 z-10 bg-amber-100 px-3 py-2 text-amber-950 uppercase text-[11px]">
                    Monday Night Tiebreaker:
                  </td>
                  <td className="px-3 py-2 text-center text-amber-900 text-xs">
                    Combined Pts
                  </td>
                  {activePlayers.map(player => {
                    const tb = picks[player.name]?.tiebreaker;
                    return (
                      <td key={player.id} className="px-2 py-2 text-center text-xs font-black text-amber-950 border-r border-amber-300">
                        {tb !== undefined && tb !== null && tb !== '' ? `${tb} pts` : '—'}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* LAYOUT 2: HORIZONTAL LEDGER (Contenders Down, Games Across)   */}
        {/* ------------------------------------------------------------- */}
        {selectedLayout === 'horizontal_ledger' && (
          <div className="overflow-x-auto contain-content" style={{ contain: 'content' }}>
            <table className={`w-full text-xs text-left border-collapse min-w-[1200px] ${theme.fontClass}`}>
              <thead>
                <tr className={`${theme.tableHeaderBg} ${theme.tableHeaderText}`}>
                  <th className={`sticky left-0 z-20 ${theme.tableHeaderBg} px-3 py-3 font-bold border-r ${theme.accentBorder} min-w-[50px] text-center`}>
                    Rank
                  </th>
                  <th className={`sticky left-[50px] z-20 ${theme.tableHeaderBg} px-3 py-3 font-bold border-r ${theme.accentBorder} min-w-[130px]`}>
                    Contender
                  </th>
                  <th className={`px-2 py-3 font-bold border-r ${theme.accentBorder} text-center min-w-[55px]`}>
                    W
                  </th>
                  <th className={`px-2 py-3 font-bold border-r ${theme.accentBorder} text-center min-w-[55px]`}>
                    L
                  </th>

                  {games.map(game => (
                    <th 
                      key={game.gameNumber}
                      className={`px-2 py-2 font-bold border-r ${theme.accentBorder} text-center min-w-[70px] text-[10px]`}
                      title={`Game ${game.gameNumber}: ${game.awayTeam} @ ${game.homeTeam}`}
                    >
                      <div>G{game.gameNumber}</div>
                      <div className="text-[9px] opacity-75">{game.isMNF ? 'MNF' : game.day}</div>
                    </th>
                  ))}

                  <th className={`px-3 py-3 font-bold border-l ${theme.accentBorder} text-center min-w-[80px]`}>
                    Tiebreaker
                  </th>
                </tr>
              </thead>

              <tbody>
                {activePlayers.map((player, pIdx) => {
                  const pPicks = picks[player.name]?.picks || {};
                  let wins = 0;
                  let losses = 0;
                  games.forEach(g => {
                    if (g.status === 'final' && g.officialWinner) {
                      const pick = pPicks[g.gameNumber];
                      if (pick && pick.toLowerCase() === g.officialWinner.toLowerCase()) {
                        wins++;
                      } else {
                        losses++;
                      }
                    }
                  });

                  return (
                    <tr 
                      key={player.id}
                      className={`border-b ${theme.tableBorder} ${pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} ${theme.rowHover}`}
                    >
                      <td className={`sticky left-0 z-10 ${pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} px-2 py-2.5 font-bold border-r ${theme.tableBorder} text-center text-slate-700`}>
                        #{pIdx + 1}
                      </td>

                      <td className={`sticky left-[50px] z-10 ${pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} px-3 py-2.5 font-bold border-r ${theme.tableBorder} text-slate-900`}>
                        {player.name}
                        {player.role === 'admin' && (
                          <span className="ml-1 text-[9px] text-amber-600 font-bold">★ Admin</span>
                        )}
                      </td>

                      <td className="px-2 py-2 text-center border-r font-black text-emerald-800 bg-emerald-50/40">
                        {wins}
                      </td>

                      <td className="px-2 py-2 text-center border-r font-semibold text-rose-700 bg-rose-50/30">
                        {losses}
                      </td>

                      {games.map(game => {
                        const pick = pPicks[game.gameNumber];
                        const isAutoDefault = picks[player.name]?.autoDefaultGames?.includes(game.gameNumber);
                        const isFinal = game.status === 'final' && game.officialWinner;
                        const isCorrect = isFinal && pick && pick.toLowerCase() === game.officialWinner?.toLowerCase();
                        const isWrong = isFinal && pick && pick.toLowerCase() !== game.officialWinner?.toLowerCase();

                        return (
                          <td 
                            key={game.gameNumber}
                            className={`px-1.5 py-2 text-center border-r text-[10px] font-bold ${
                              isCorrect ? 'bg-emerald-100/90 text-emerald-950' :
                              isWrong ? 'bg-rose-50/80 text-rose-700' : 'text-slate-800'
                            }`}
                          >
                            <span className="inline-flex items-center justify-center gap-0.5">
                              {isAutoDefault && <span className="text-[9px] text-amber-700 font-bold" title="Auto-assigned Vegas Favorite at kickoff (Dad's Rule)">🤖</span>}
                              <span>{pick || '—'}</span>
                            </span>
                          </td>
                        );
                      })}

                      <td className="px-2 py-2 text-center border-l font-bold text-slate-900 bg-amber-50/50">
                        {picks[player.name]?.tiebreaker ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* LAYOUT 3: PRINTABLE BLANK TAKE-HOME SELECTION SHEET           */}
        {/* ------------------------------------------------------------- */}
        {selectedLayout === 'blank_takehome' && (
          <div className="p-6 sm:p-8 bg-white space-y-6 font-sans max-w-4xl mx-auto border-2 border-slate-900 my-4 shadow-sm print:border-none print:m-0 print:p-0">
            {/* Ballot Title Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4">
              <div className="text-xs font-black tracking-widest text-slate-900 uppercase">
                {poolCfg.leagueName} • {poolCfg.associationName}
              </div>
              <h2 className="text-2xl font-black tracking-tight text-slate-950 uppercase mt-1">
                WEEK {selectedPrintWeek} OFFICIAL SELECTION SHEET
              </h2>
              <p className="text-xs font-semibold text-slate-600 mt-1">
                Circle or check ONE outright winning team per matchup. Total combined points on Monday Night breaks any 1st-place ties.
              </p>
            </div>

            {/* Contender Name & Tiebreaker Entry Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-2 border-slate-900 p-4 bg-slate-50 print:bg-white">
              <div>
                <div className="text-[10px] uppercase font-black text-slate-700">Contender Name:</div>
                <div className="border-b-2 border-slate-900 h-8 pt-1 font-bold text-sm">
                  {activePlayer ? activePlayer.name : '________________________'}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-black text-slate-700">Monday Night Tiebreaker:</div>
                <div className="border-b-2 border-slate-900 h-8 pt-1 font-bold text-sm">
                  ____ Total Combined Points
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-black text-slate-700">Phone or Contact:</div>
                <div className="border-b-2 border-slate-900 h-8 pt-1 font-bold text-sm text-slate-600">
                  {activePlayer?.email || '________________________'}
                </div>
              </div>
            </div>

            {isLoadingFutureWeek ? (
              <div className="py-12 text-center text-slate-500 font-bold">
                Loading schedule for Week {selectedPrintWeek} from official NFL wire...
              </div>
            ) : (
              /* All Matchups 2-Column Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scheduledGamesForWeek.map(game => (
                  <div 
                    key={game.gameNumber} 
                    className="border-2 border-slate-900 p-3 bg-white flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-black bg-slate-900 text-white px-2 py-0.5 rounded text-[10px]">
                        GAME {game.gameNumber}
                      </span>
                      <div className="text-[10px] font-bold text-slate-600">
                        {game.day} • {game.kickoffTime} {game.isMNF ? '★ MNF' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 font-bold text-sm">
                      <span className="px-2.5 py-1 border-2 border-slate-800 rounded bg-slate-50">
                        [ ] {game.awayTeam}
                      </span>
                      <span className="text-slate-400 font-normal">@</span>
                      <span className="px-2.5 py-1 border-2 border-slate-800 rounded bg-slate-50">
                        [ ] {game.homeTeam}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Monday Night Tiebreaker Highlight Box */}
            <div className="border-2 border-slate-900 p-4 bg-amber-50 print:bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <div className="font-black text-slate-950 text-sm">
                  ★ MONDAY NIGHT FOOTBALL PREDICTION
                </div>
                <div className="text-xs text-slate-700">
                  Total combined points scored by both teams on Monday Night (used solely to crown the 1st-place weekly winner).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900">MY PREDICTION:</span>
                <div className="border-2 border-slate-900 bg-white px-4 py-1.5 text-base font-black text-center w-28">
                  ____ PTS
                </div>
              </div>
            </div>

            {/* Bottom Rules & Association Note */}
            <div className="text-[11px] text-center text-slate-600 border-t-2 border-slate-900 pt-3">
              {poolCfg.leagueName} • {poolCfg.associationName} • Straight-Up Picks (No Point Spreads) • 100% Proceeds to Umpire Gear
            </div>
          </div>
        )}

        {/* SHEET FOOTER */}
        <div className={`p-3 ${theme.headerSubBg} ${theme.headerText} border-t-2 ${theme.accentBorder} flex flex-wrap items-center justify-between text-xs`}>
          <div className="flex items-center gap-2">
            <span className="font-bold">Format:</span>
            <span className="opacity-90">
              Straight-up wins • 1 point per win • Monday Night First-Place Tiebreaker
            </span>
          </div>
          <div className="font-mono text-[11px] opacity-80">
            {scheduledGamesForWeek.length} Games • Official Scraped Schedule
          </div>
        </div>
      </div>
    </div>
  );
});
