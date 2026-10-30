import React, { useState, memo } from 'react';
import { 
  FileSpreadsheet, 
  Printer, 
  PenTool, 
  Coffee, 
  RotateCcw,
  CheckCircle, 
  XCircle,
  SlidersHorizontal
} from 'lucide-react';
import { Game, Player, PlayerPickData, SeasonHistory } from '../types';
import { isGameTie } from '../utils/nflTieEngine';
import { getSavedPoolConfig } from '../config/leagueConfig';

export type SheetTheme = 
  | 'parchment' 
  | 'original_forest' 
  | 'crimson_gold';

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
  // Theme and Layout Options: default to Parchment aged paper sheet
  const [selectedTheme, setSelectedTheme] = useState<SheetTheme>('parchment');
  const [selectedLayout, setSelectedLayout] = useState<SheetLayout>('vertical_matrix');
  const [showHandwritten, setShowHandwritten] = useState<boolean>(true);
  const [showCoffeeStain, setShowCoffeeStain] = useState<boolean>(true);
  const [useHistoricalAliases, setUseHistoricalAliases] = useState<boolean>(true);
  const [highlightContender, setHighlightContender] = useState<string>('all');
  const [showOptionsTray, setShowOptionsTray] = useState<boolean>(false);

  // Latest compiled week and reigning weekly winner
  const latestCompiledWeek = seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0 
    ? Math.max(...seasonHistory.compiledWeeks) 
    : 1;
  const currentActiveWeek = (games && games.length > 0 && (games[0] as any).week)
    ? (games[0] as any).week
    : (latestCompiledWeek + 1);

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

  // Filter to active players and sort sequentially by season total wins (descending)
  const activePlayers = React.useMemo(() => {
    const list = players.filter(p => p.isActive !== false);
    if (!seasonHistory?.records) return list;
    return [...list].sort((a, b) => {
      const aWins = seasonHistory.records[a.name]?.totalWins ?? 0;
      const bWins = seasonHistory.records[b.name]?.totalWins ?? 0;
      if (bWins !== aWins) return bWins - aWins;
      return a.name.localeCompare(b.name);
    });
  }, [players, seasonHistory]);

  // Helper to get display name
  const getDisplayName = (player: Player) => {
    return player.name;
  };

  // Helper to check if player should use handwritten pen
  const isHandwrittenPlayer = (player: Player) => {
    if (!showHandwritten) return false;
    return Boolean(player.hasHandwrittenPicks || showHandwritten);
  };

  // Handwriting font and rotation per player for variety
  const getHandwritingStyle = (player: Player, gameNum: number) => {
    const rotations = [-1.2, 0.8, -0.6, 1.4, -0.9, 0.5];
    const rot = rotations[(gameNum + player.name.length) % rotations.length];
    const styleIdx = player.name.length % 3;

    if (styleIdx === 0) {
      return {
        fontFamily: "'Caveat', cursive",
        color: '#1a365d',
        fontSize: '15px',
        fontWeight: '700',
        letterSpacing: '0.3px',
        transform: `rotate(${rot}deg)`,
        display: 'inline-block'
      };
    } else if (styleIdx === 1) {
      return {
        fontFamily: "'Kalam', cursive",
        color: '#1e3a5f',
        fontSize: '14px',
        fontWeight: '700',
        transform: `rotate(${rot * 0.9}deg)`,
        display: 'inline-block'
      };
    }

    return {
      fontFamily: "'Caveat', cursive",
      color: '#1e293b',
      fontSize: '14px',
      fontWeight: '600',
      display: 'inline-block'
    };
  };

  // Color Theme definitions (Deep, rich, authentic colors)
  const themeStyles = {
    parchment: {
      id: 'parchment',
      name: "Vintage Parchment (Aged Paper)",
      badgeBg: 'bg-stone-300 text-stone-900 border border-stone-400 font-bold',
      containerBg: 'bg-[#f7f4ea]',
      borderColor: 'border-[#c8b99c]',
      headerBg: 'bg-[#ebe3d0]',
      headerText: 'text-[#3e3422]',
      headerSubBg: 'bg-[#dfd4bd]',
      tableHeaderBg: 'bg-[#423623]',
      tableHeaderText: 'text-[#faebd7]',
      tableSubHeaderBg: 'bg-[#5a4a32]',
      winnerCellBg: 'bg-[#2d2417] text-amber-300',
      winnerCellBody: 'text-emerald-950 font-black bg-emerald-100/90 border border-emerald-300',
      accentBorder: 'border-[#8c7853]',
      fontClass: 'font-serif',
      tableBorder: 'border-[#c8b99c]',
      rowHover: 'hover:bg-[#eee6d3]',
      paperAged: true
    },
    original_forest: {
      id: 'original_forest',
      name: "Vintage Forest Green",
      badgeBg: 'bg-[#0f281b] text-emerald-100 font-bold border border-emerald-800',
      containerBg: 'bg-[#f4f8f5]',
      borderColor: 'border-[#1b3a2b]',
      headerBg: 'bg-[#1b3a2b]',
      headerText: 'text-emerald-50',
      headerSubBg: 'bg-[#142e22]',
      tableHeaderBg: 'bg-[#0d2317]',
      tableHeaderText: 'text-emerald-100',
      tableSubHeaderBg: 'bg-[#183928]',
      winnerCellBg: 'bg-[#09170f] text-amber-300',
      winnerCellBody: 'text-emerald-950 font-black bg-emerald-100 border border-emerald-400',
      accentBorder: 'border-[#1b3a2b]',
      fontClass: 'font-sans',
      tableBorder: 'border-emerald-800/40',
      rowHover: 'hover:bg-emerald-100/50',
      paperAged: false
    },
    crimson_gold: {
      id: 'crimson_gold',
      name: "Championship Crimson & Gold",
      badgeBg: 'bg-[#aa0000] text-[#ffd700] font-black border border-[#b3995d]',
      containerBg: 'bg-[#fffaf2]',
      borderColor: 'border-[#b3995d]',
      headerBg: 'bg-gradient-to-r from-[#820000] via-[#aa0000] to-[#6d0000]',
      headerText: 'text-[#fff8e7]',
      headerSubBg: 'bg-[#6d0000]',
      tableHeaderBg: 'bg-[#660000]',
      tableHeaderText: 'text-[#ffd700]',
      tableSubHeaderBg: 'bg-[#8a0000]',
      winnerCellBg: 'bg-[#400000] text-[#ffd700]',
      winnerCellBody: 'text-[#aa0000] font-black bg-amber-100/95 border border-[#b3995d]',
      accentBorder: 'border-[#b3995d]',
      fontClass: 'font-sans',
      tableBorder: 'border-[#b3995d]/60',
      rowHover: 'hover:bg-amber-100/60',
      paperAged: false
    }
  };

  const theme = themeStyles[selectedTheme];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="legacy-pick-sheet-container" className="mb-8 space-y-4">
      {/* CONTROL & PREFERENCE BAR */}
      <div className="bg-white rounded-xl border border-slate-300 p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Parchment & Pick Sheet Styles
              </h3>
              <p className="text-xs text-slate-500">
                Printable weekly master pick sheets, team themes & take-home slips
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowOptionsTray(prev => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                showOptionsTray 
                  ? 'bg-slate-900 text-white border-slate-950' 
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showOptionsTray ? 'Hide Pen/Aging Options' : 'Pen & Paper Options'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 cursor-pointer transition-all"
              title="Print this sheet or save to PDF"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>

        {/* THEME SELECTOR PILLS */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Pick Sheet Theme:
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTheme('parchment')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedTheme === 'parchment'
                  ? 'bg-[#3e3422] text-[#f7f4ea] border-[#251f14] shadow-xs ring-2 ring-[#c8b99c]'
                  : 'bg-[#f7f4ea] text-[#3e3422] border-[#c8b99c] hover:bg-[#ebe3d0]'
              }`}
            >
              <span>📜 Vintage Parchment</span>
            </button>

            <button
              onClick={() => setSelectedTheme('crimson_gold')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedTheme === 'crimson_gold'
                  ? 'bg-gradient-to-r from-[#820000] to-[#aa0000] text-[#ffd700] border-[#5a0000] shadow-xs ring-2 ring-[#b3995d]'
                  : 'bg-red-50 text-[#820000] border-red-300 hover:bg-red-100'
              }`}
            >
              <span>🏈 Crimson &amp; Gold</span>
            </button>

            <button
              onClick={() => setSelectedTheme('original_forest')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedTheme === 'original_forest'
                  ? 'bg-[#1b3a2b] text-white border-emerald-950 shadow-xs ring-2 ring-emerald-500'
                  : 'bg-emerald-50 text-[#1b3a2b] border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              <span>🌲 Forest Green</span>
            </button>

          </div>
        </div>

        {/* LAYOUT SELECTOR */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">
              Layout Style:
            </span>
            <div className="inline-flex rounded-lg p-1 bg-slate-100 border border-slate-300">
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
                Ledger View (Contenders ↓)
              </button>
              <button
                onClick={() => setSelectedLayout('blank_takehome')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  selectedLayout === 'blank_takehome'
                    ? 'bg-amber-100 text-amber-950 shadow-2xs border border-amber-300 font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📝 Printable Take-Home Slip
              </button>
            </div>
          </div>

          {/* Filter by Contender Highlight */}
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
        </div>

        {/* EXPANDABLE DISPLAY SETTINGS */}
        {showOptionsTray && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={showHandwritten}
                onChange={(e) => setShowHandwritten(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700"
              />
              <span className="flex items-center gap-1">
                <PenTool className="w-3.5 h-3.5 text-blue-700" />
                <span>Handwritten Pen Style</span>
              </span>
            </label>

            <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={showCoffeeStain}
                onChange={(e) => setShowCoffeeStain(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700"
              />
              <span className="flex items-center gap-1">
                <Coffee className="w-3.5 h-3.5 text-amber-800" />
                <span>Subtle Paper Stains & Aging</span>
              </span>
            </label>

            <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={useHistoricalAliases}
                onChange={(e) => setUseHistoricalAliases(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-800 focus:ring-emerald-700"
              />
              <span className="flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5 text-indigo-700" />
                <span>Use Historical Name Aliases</span>
              </span>
            </label>
          </div>
        )}
      </div>

      {/* THE ACTUAL PICK SHEET CONTAINER */}
      <div 
        className={`relative rounded-xl border-2 ${theme.borderColor} ${theme.containerBg} overflow-hidden shadow-sm transition-all`}
        style={{
          boxShadow: theme.paperAged ? 'inset 0 0 40px rgba(180, 160, 120, 0.15)' : undefined
        }}
      >
        {/* Subtle Coffee Ring Graphic */}
        {theme.paperAged && showCoffeeStain && (
          <div 
            className="absolute -top-12 -right-12 w-48 h-48 rounded-full border-[10px] border-amber-900/10 pointer-events-none z-30"
            style={{
              filter: 'blur(1px)',
              transform: 'rotate(25deg)'
            }}
          />
        )}

        {/* SHEET HEADER BANNER */}
        <div className={`p-4 ${theme.headerBg} ${theme.headerText} border-b-2 ${theme.accentBorder} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base sm:text-lg font-bold tracking-tight">
                {selectedTheme === 'parchment'
                  ? "Vintage Parchment Football Pool Pick Sheet"
                  : selectedTheme === 'crimson_gold'
                  ? "Championship Crimson & Gold Master Pick Sheet"
                  : "Vintage Forest Master Pick Sheet"}
              </h4>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${selectedTheme === 'parchment' ? 'bg-[#dfd4bd] text-[#3e3422] border border-[#c8b99c]' : selectedTheme === 'crimson_gold' ? 'bg-[#ffd700] text-[#820000]' : 'bg-white/20 text-white'}`}>
                Week {currentActiveWeek} Master
              </span>
            </div>
            <div className="text-xs opacity-90 flex flex-wrap items-center gap-3 mt-1 font-medium">
              <span>{activePlayers.length} Contenders</span>
              <span>•</span>
              <span>Tiebreaker: Total Points on Monday Night</span>
              {useHistoricalAliases && (
                <span className="italic opacity-75">
                  (Displaying Original Roster Names)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* LAYOUT 1: VERTICAL GRID (Original Format: Games Down)         */}
        {/* ------------------------------------------------------------- */}
        {selectedLayout === 'vertical_matrix' && (
          <div className="overflow-x-auto contain-content" style={{ contain: 'content' }}>
            <table className={`w-full text-xs text-left border-collapse min-w-[1300px] ${theme.fontClass}`}>
              <thead>
                <tr className={`${theme.tableHeaderBg || theme.headerBg} ${theme.tableHeaderText || theme.headerText}`}>
                  <th className={`sticky left-0 z-20 ${theme.tableHeaderBg || theme.headerBg} px-3 py-3 font-bold border-r ${theme.accentBorder} min-w-[65px]`}>
                    Game
                  </th>
                  <th className={`sticky left-[65px] z-20 ${theme.tableHeaderBg || theme.headerBg} px-3 py-3 font-bold border-r ${theme.accentBorder} min-w-[155px]`}>
                    Matchup
                  </th>
                  <th className={`sticky left-[220px] z-20 ${theme.tableHeaderBg || theme.headerBg} px-3 py-3 font-bold border-r ${theme.accentBorder} min-w-[105px]`}>
                    Day & Kickoff
                  </th>
                  <th className={`sticky left-[325px] z-20 ${theme.winnerCellBg} px-3 py-3 font-bold border-r-2 ${theme.accentBorder} min-w-[115px]`}>
                    Official Winner
                  </th>
                  {activePlayers.map(player => {
                    const isHandwritten = isHandwrittenPlayer(player);
                    const displayName = getDisplayName(player);
                    const isHighlighted = highlightContender === player.name;
                    const isWeeklyWinner = player.name === currentWeeklyWinnerName;

                    return (
                      <th 
                        key={player.id} 
                        className={`px-3 py-2.5 font-bold text-center border-r ${theme.accentBorder} min-w-[125px] transition-colors ${
                          isWeeklyWinner
                            ? 'bg-amber-300 text-amber-950 font-black border-2 border-amber-500 shadow-sm ring-2 ring-amber-400/70'
                            : isHighlighted 
                              ? 'bg-amber-400 text-slate-950 font-bold' 
                              : player.isDefendingChamp 
                                ? 'bg-amber-200 text-amber-950 border-amber-400' 
                                : ''
                        }`}
                      >
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <div className="flex items-center justify-center gap-1 text-sm sm:text-base font-black text-slate-950 whitespace-nowrap">
                            {isWeeklyWinner && <span className="text-amber-800 select-none">👑</span>}
                            {player.isDefendingChamp && '🏆 '}
                            <span>{displayName}</span>
                          </div>
                          {isWeeklyWinner ? (
                            <span className="bg-amber-400 text-amber-950 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-amber-600 shadow-2xs whitespace-nowrap">
                              Wk {latestCompiledWeek} Winner
                            </span>
                          ) : isHandwritten ? (
                            <span className="text-[9px] uppercase tracking-wider text-blue-800 font-mono">
                              [Pen Ink]
                            </span>
                          ) : null}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {games.map((game, gIdx) => {
                  const isMNF = game.isMNF;
                  return (
                    <tr 
                      key={game.gameNumber} 
                      className={`border-b ${theme.tableBorder} ${theme.rowHover} transition-colors ${
                        isMNF ? 'bg-amber-50/70 font-semibold' : gIdx % 2 === 0 ? 'bg-white/60' : 'bg-transparent'
                      }`}
                    >
                      <td className={`sticky left-0 z-10 ${gIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/90'} px-3 py-2.5 font-bold text-slate-900 border-r ${theme.tableBorder}`}>
                        #{game.gameNumber} {isMNF && <span className="text-amber-700">★</span>}
                      </td>
                      <td className={`sticky left-[65px] z-10 ${gIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/90'} px-3 py-2.5 font-bold text-slate-900 border-r ${theme.tableBorder}`}>
                        <div className="flex items-center gap-1 truncate">
                          <span>{game.awayTeam}</span>
                          <span className="text-slate-400 font-normal">@</span>
                          <span>{game.homeTeam}</span>
                        </div>
                      </td>
                      <td className={`sticky left-[220px] z-10 ${gIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/90'} px-3 py-2.5 text-slate-600 border-r ${theme.tableBorder} text-[11px]`}>
                        {game.day.replace(' Night', '')} {game.kickoffTime}
                      </td>
                      <td className={`sticky left-[325px] z-10 ${
                        isGameTie(game) 
                          ? 'bg-sky-100/80 text-sky-950 border-r-2 border-sky-400 font-black' 
                          : gIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/90'
                      } px-3 py-2.5 font-bold border-r-2 ${theme.accentBorder}`}>
                        {isGameTie(game) ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-sky-200/90 text-sky-950 border border-sky-400 font-black inline-flex items-center gap-1 shadow-2xs" title="Official NFL Game Tie — Push (0 Pts: Straight Up, Nobody Won, Nobody Lost)">
                            <span>⚖️</span>
                            <span>TIE (Push - 0 Pts)</span>
                          </span>
                        ) : game.officialWinner ? (
                          <span className={`px-2 py-0.5 rounded text-xs ${theme.winnerCellBody}`}>
                            {game.officialWinner}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal italic text-[11px]">
                            {game.status === 'in_progress' ? '🏈 Playing...' : 'Pending'}
                          </span>
                        )}
                      </td>

                      {/* PLAYER PICKS */}
                      {activePlayers.map(player => {
                        const pick = picks[player.name]?.picks[game.gameNumber];
                        const isTie = isGameTie(game);
                        const isWinner = !isTie && game.status === 'final' && game.officialWinner && pick && pick.toLowerCase() === game.officialWinner.toLowerCase();
                        const isLoser = !isTie && game.status === 'final' && game.officialWinner && pick && pick.toLowerCase() !== game.officialWinner.toLowerCase();
                        const isHandwritten = isHandwrittenPlayer(player);
                        const hwStyle = isHandwritten ? getHandwritingStyle(player, game.gameNumber) : {};
                        const isHighlighted = highlightContender === player.name;

                        return (
                          <td 
                            key={player.id} 
                            className={`px-3 py-2 text-center border-r ${theme.tableBorder} transition-colors ${
                              isHighlighted ? 'bg-amber-100/70 font-bold' :
                              isTie && pick ? 'bg-sky-100/75 text-sky-950 font-bold border-sky-300 ring-1 ring-sky-300/60 shadow-2xs' :
                              isWinner ? 'bg-emerald-100/90 text-emerald-950 font-bold' :
                              isLoser ? 'bg-rose-50/80 text-rose-700 font-medium' : ''
                            }`}
                          >
                            {pick ? (
                              <div className="flex items-center justify-center gap-1">
                                {isTie && <span className="text-xs shrink-0" title="Tie (Push)">⚖️</span>}
                                {isWinner && <CheckCircle className="w-3 h-3 text-emerald-700 shrink-0" />}
                                {isLoser && <XCircle className="w-3 h-3 text-rose-500 shrink-0" />}
                                <span 
                                  style={isHandwritten ? hwStyle : undefined}
                                  className={!isHandwritten ? 'font-bold text-slate-800' : ''}
                                >
                                  {pick}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-mono">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* TIEBREAKER FOOTER ROW */}
                <tr className={`${theme.tableHeaderBg || theme.headerSubBg} ${theme.tableHeaderText || theme.headerText} font-bold border-t-2 ${theme.accentBorder}`}>
                  <td colSpan={4} className="sticky left-0 z-10 px-4 py-2.5 text-right uppercase tracking-wider text-xs">
                    ★ MNF Tiebreaker Points Prediction:
                  </td>
                  {activePlayers.map(player => {
                    const tb = picks[player.name]?.tiebreaker;
                    const isHandwritten = isHandwrittenPlayer(player);
                    const hwStyle = isHandwritten ? getHandwritingStyle(player, 16) : {};

                    return (
                      <td key={player.id} className={`px-3 py-2.5 text-center border-r ${theme.accentBorder} text-sm`}>
                        {tb !== undefined && tb !== '' ? (
                          <span 
                            style={isHandwritten ? { ...hwStyle, fontSize: '15px' } : undefined}
                            className={!isHandwritten ? 'bg-amber-300 text-slate-950 px-2 py-0.5 rounded font-bold text-xs' : ''}
                          >
                            {tb} pts
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* WEEK SCORE FOOTER ROW */}
                <tr className={`${theme.headerSubBg || 'bg-slate-100'} ${theme.headerText} font-bold border-t ${theme.accentBorder}`}>
                  <td colSpan={4} className="sticky left-0 z-10 px-4 py-2 text-right uppercase tracking-wider text-xs">
                    🏈 Week {currentActiveWeek} Score (Wins):
                  </td>
                  {activePlayers.map(player => {
                    const playerPicks = picks[player.name]?.picks || {};
                    let wins = 0;
                    let hasFinal = false;
                    games.forEach(g => {
                      if (g.status === 'final') {
                        hasFinal = true;
                        if (!isGameTie(g) && g.officialWinner && playerPicks[g.gameNumber]?.toLowerCase() === g.officialWinner.toLowerCase()) {
                          wins++;
                        }
                      }
                    });

                    const playerPastWinners = Object.entries(seasonHistory?.records?.[player.name]?.weeklyBreakdown || {})
                      .filter(([_, rec]: [string, any]) => rec?.isWinner)
                      .map(([wk]) => Number(wk));
                    const isReigningWinner = player.name === currentWeeklyWinnerName;
                    const wonPriorWeek = playerPastWinners.length > 0;

                    return (
                      <td key={player.id} className={`px-3 py-2 text-center border-r ${theme.accentBorder} font-black text-xs transition-colors ${
                        isReigningWinner 
                          ? 'bg-amber-400/20 text-amber-950 border-amber-400/40' 
                          : wonPriorWeek 
                            ? 'bg-amber-300/15 text-amber-900 border-amber-300/30' 
                            : ''
                      }`}>
                        {hasFinal ? (
                          <span className={`px-2 py-0.5 rounded-md font-black inline-flex items-center gap-1 shadow-xs ${
                            isReigningWinner
                              ? 'bg-amber-400/30 text-amber-950 border border-amber-500/50'
                              : wonPriorWeek
                                ? 'bg-amber-300/25 text-amber-900 border border-amber-400/40'
                                : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                          }`}>
                            {(isReigningWinner || wonPriorWeek) && <span className="text-[10px]">👑</span>}
                            <span>{wins} W</span>
                          </span>
                        ) : isReigningWinner ? (
                          <span className="bg-amber-400/25 text-amber-950 px-2 py-1 rounded-md text-[10px] font-black border border-amber-400/40 shadow-xs inline-flex items-center gap-1 backdrop-blur-xs" title={`Reigning Week ${latestCompiledWeek} Winner`}>
                            <span className="text-[10px]">👑</span> <span>Wk {latestCompiledWeek} Winner</span>
                          </span>
                        ) : wonPriorWeek ? (
                          <span className="bg-amber-300/20 text-amber-900 px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-300/30 inline-flex items-center gap-0.5" title={`Prior Week ${playerPastWinners.join(', ')} Winner`}>
                            <span className="text-[9px]">👑</span> <span>Wk {playerPastWinners.join(', ')}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* SEASON TOTAL WINS FOOTER ROW */}
                <tr className={`${theme.headerSubBg || 'bg-slate-100'} ${theme.headerText} font-bold border-t ${theme.accentBorder}`}>
                  <td colSpan={4} className="sticky left-0 z-10 px-4 py-2 text-right uppercase tracking-wider text-xs">
                    👑 Season Total Wins:
                  </td>
                  {activePlayers.map(player => {
                    const playerPicks = picks[player.name]?.picks || {};
                    let activeWins = 0;
                    let hasFinal = false;
                    games.forEach(g => {
                      if (g.status === 'final') {
                        hasFinal = true;
                        if (!isGameTie(g) && g.officialWinner && playerPicks[g.gameNumber]?.toLowerCase() === g.officialWinner.toLowerCase()) {
                          activeWins++;
                        }
                      }
                    });
                    const priorWins = seasonHistory?.records?.[player.name]?.totalWins ?? 0;
                    const totalWins = priorWins + (hasFinal ? activeWins : 0);
                    const hasRecord = seasonHistory?.records?.[player.name] !== undefined || hasFinal;

                    return (
                      <td key={player.id} className={`px-3 py-2 text-center border-r ${theme.accentBorder} font-black text-xs`}>
                        {hasRecord ? (
                          <span className="bg-amber-300 text-amber-950 px-2 py-0.5 rounded font-black border border-amber-500 shadow-2xs inline-block">
                            {totalWins} W
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>

            {/* Pick Sheet Visual Color Legend */}
            <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2.5 bg-slate-50/90 border-t border-slate-300 text-xs text-slate-700">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-slate-900">Sheet Color Key:</span>
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
                  <span className="text-sky-950 font-bold">Translucent Light Blue = ⚖️ Game Tie (Straight Up Push — 0 Pts)</span>
                </span>
              </div>
              <span className="text-slate-500 italic text-[11px]">
                Theme "Straight Up": In an NFL tie, nobody won and nobody lost. A tie is a push with 0 points awarded.
              </span>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* LAYOUT 2: CONTENDER LEDGER (Contenders Vertical ↓)            */}
        {/* ------------------------------------------------------------- */}
        {selectedLayout === 'horizontal_ledger' && (
          <div className="overflow-x-auto contain-content" style={{ contain: 'content' }}>
            <table className={`w-full text-xs text-left border-collapse min-w-[1400px] ${theme.fontClass}`}>
              <thead>
                <tr className={`${theme.tableHeaderBg || theme.headerBg} ${theme.tableHeaderText || theme.headerText}`}>
                  <th className={`sticky left-0 z-20 ${theme.tableHeaderBg || theme.headerBg} px-4 py-3 font-bold min-w-[170px] border-r ${theme.accentBorder}`}>
                    Contender
                  </th>
                  <th className={`sticky left-[170px] z-20 ${theme.tableHeaderBg || theme.headerBg} px-3 py-3 font-bold min-w-[90px] text-center border-r ${theme.accentBorder}`}>
                    Role / Status
                  </th>
                  {games.map(game => {
                    const isTie = isGameTie(game);
                    return (
                      <th 
                        key={game.gameNumber} 
                        className={`px-2 py-2 text-center min-w-[85px] border-r ${theme.accentBorder} ${
                          isTie ? 'bg-sky-700/85 text-white ring-1 ring-sky-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="font-bold text-[11px]">G{game.gameNumber}</span>
                          {isTie && <span className="text-[9px] bg-sky-200 text-sky-950 font-black px-1 rounded shadow-2xs">TIE</span>}
                        </div>
                        <div className="text-[9px] leading-tight opacity-90 mt-0.5" title={`${game.awayTeam} @ ${game.homeTeam}`}>
                          <div className="truncate">{game.awayTeam}</div>
                          <div className="truncate opacity-80">@{game.homeTeam}</div>
                        </div>
                      </th>
                    );
                  })}
                  <th className={`px-3 py-3 font-bold text-center min-w-[85px] border-r ${theme.accentBorder} bg-emerald-800 text-white`}>
                    Wk {currentActiveWeek} Wins
                  </th>
                  <th className={`px-4 py-3 font-bold text-center min-w-[95px] border-r ${theme.accentBorder} bg-amber-400 text-amber-950`}>
                    Season Total
                  </th>
                  <th className={`px-4 py-3 font-bold text-center min-w-[90px] ${theme.winnerCellBg}`}>
                    MNF Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {activePlayers.map((player, pIdx) => {
                  const isHandwritten = isHandwrittenPlayer(player);
                  const displayName = getDisplayName(player);
                  const playerPicks = picks[player.name]?.picks || {};
                  const tb = picks[player.name]?.tiebreaker;

                  return (
                    <tr 
                      key={player.id} 
                      className={`border-b ${theme.tableBorder} ${theme.rowHover} ${
                        pIdx % 2 === 0 ? 'bg-white/70' : 'bg-transparent'
                      }`}
                    >
                      <td className={`sticky left-0 z-10 ${pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/90'} px-4 py-3 font-bold border-r ${theme.tableBorder}`}>
                        <div className="flex items-center gap-1.5">
                          {player.isDefendingChamp && <span>🏆</span>}
                          <span className="text-sm font-bold text-slate-900">{displayName}</span>
                        </div>
                      </td>

                      <td className={`sticky left-[170px] z-10 ${pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/90'} px-3 py-3 text-center border-r ${theme.tableBorder}`}>
                        {player.role === 'consultant' && (
                          <span className="bg-emerald-100 text-emerald-950 font-bold px-1.5 py-0.5 rounded text-[10px]">
                            Crew Chief
                          </span>
                        )}
                        {player.role === 'admin' && (
                          <span className="bg-slate-200 text-slate-900 font-bold px-1.5 py-0.5 rounded text-[10px]">
                            Admin
                          </span>
                        )}
                        {player.isDefendingChamp && (
                          <span className="bg-amber-200 text-amber-950 font-bold px-1.5 py-0.5 rounded text-[10px]">
                            Champ
                          </span>
                        )}
                        {player.role === 'player' && !player.isDefendingChamp && (
                          <span className="text-slate-500 font-medium text-[10px]">Contender</span>
                        )}
                      </td>

                      {/* Games 1-16 */}
                      {games.map(game => {
                        const pick = playerPicks[game.gameNumber];
                        const isFinal = game.status === 'final';
                        const winner = game.officialWinner;
                        const isTie = isGameTie(game);
                        const isWinner = !isTie && isFinal && winner && pick && pick.toLowerCase() === winner.toLowerCase();
                        const isLoser = !isTie && isFinal && winner && pick && pick.toLowerCase() !== winner.toLowerCase();
                        const hwStyle = isHandwritten ? getHandwritingStyle(player, game.gameNumber) : {};

                        return (
                          <td 
                            key={game.gameNumber} 
                            className={`px-2 py-2.5 text-center border-r ${theme.tableBorder} ${
                              isTie && pick ? 'bg-sky-100/75 text-sky-950 font-bold border-sky-300 ring-1 ring-sky-300/60 shadow-2xs' :
                              isWinner ? 'bg-emerald-100/90 text-emerald-950 font-bold' :
                              isLoser ? 'bg-rose-50/80 text-rose-700' : ''
                            }`}
                          >
                            {pick ? (
                              <span 
                                style={isHandwritten ? hwStyle : undefined}
                                className={!isHandwritten ? 'font-bold text-slate-800 flex items-center justify-center gap-0.5' : 'flex items-center justify-center gap-0.5'}
                              >
                                {isTie && <span className="text-[10px]">⚖️</span>}
                                <span>{pick}</span>
                              </span>
                            ) : (
                              <span className="text-slate-300 font-mono">—</span>
                            )}
                          </td>
                        );
                      })}

                      {/* Week Wins */}
                      {(() => {
                        let activeWins = 0;
                        let hasFinal = false;
                        games.forEach(g => {
                          if (g.status === 'final') {
                            hasFinal = true;
                            if (!isGameTie(g) && g.officialWinner && playerPicks[g.gameNumber]?.toLowerCase() === g.officialWinner.toLowerCase()) {
                              activeWins++;
                            }
                          }
                        });
                        const priorWins = seasonHistory?.records?.[player.name]?.totalWins ?? 0;
                        const totalWins = priorWins + (hasFinal ? activeWins : 0);
                        const hasRecord = seasonHistory?.records?.[player.name] !== undefined || hasFinal;

                        const playerPastWinners = Object.entries(seasonHistory?.records?.[player.name]?.weeklyBreakdown || {})
                          .filter(([_, rec]: [string, any]) => rec?.isWinner)
                          .map(([wk]) => Number(wk));
                        const isReigningWinner = player.name === currentWeeklyWinnerName;
                        const wonPriorWeek = playerPastWinners.length > 0;

                        return (
                          <>
                            <td className={`px-3 py-2.5 text-center font-black border-r transition-colors ${
                              isReigningWinner
                                ? 'bg-amber-400/20 text-amber-950 border-amber-400/40'
                                : wonPriorWeek
                                  ? 'bg-amber-300/15 text-amber-900 border-amber-300/30'
                                  : 'text-emerald-950 bg-emerald-50/70 border-emerald-200'
                            }`}>
                              {hasFinal ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-black shadow-xs ${
                                  isReigningWinner
                                    ? 'bg-amber-400/30 text-amber-950 border border-amber-500/50'
                                    : wonPriorWeek
                                      ? 'bg-amber-300/25 text-amber-900 border border-amber-400/40'
                                      : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                                }`}>
                                  {(isReigningWinner || wonPriorWeek) && <span className="text-[10px]">👑</span>}
                                  <span>{activeWins} W</span>
                                </span>
                              ) : isReigningWinner ? (
                                <span className="inline-flex items-center gap-1 bg-amber-400/25 text-amber-950 px-2 py-1 rounded-md text-[10px] font-black border border-amber-400/40 shadow-xs backdrop-blur-xs" title={`Reigning Week ${latestCompiledWeek} Winner: ${player.name}`}>
                                  <span className="text-[10px]">👑</span> <span>Wk {latestCompiledWeek} Winner</span>
                                </span>
                              ) : wonPriorWeek ? (
                                <span className="inline-flex items-center gap-0.5 bg-amber-300/20 text-amber-900 px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-300/30" title={`Prior Week ${playerPastWinners.join(', ')} Winner`}>
                                  <span className="text-[9px]">👑</span> <span>Wk {playerPastWinners.join(', ')}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center font-black text-amber-950 bg-amber-100/90 border-r border-amber-300">
                              {hasRecord ? `${totalWins} W` : <span className="text-slate-400 font-mono">—</span>}
                            </td>
                          </>
                        );
                      })()}

                      {/* Tiebreaker */}
                      <td className="px-3 py-2.5 text-center font-bold bg-amber-50/50">
                        {tb !== undefined && tb !== '' ? (
                          <span className="font-bold text-amber-900">{tb} pts</span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Horizontal Ledger Visual Color Legend */}
            <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2.5 bg-slate-50/90 border-t border-slate-300 text-xs text-slate-700">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold text-slate-900">Sheet Color Key:</span>
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
                  <span className="text-sky-950 font-bold">Translucent Light Blue = ⚖️ Game Tie (Straight Up Push — 0 Pts)</span>
                </span>
              </div>
              <span className="text-slate-500 italic text-[11px]">
                Theme "Straight Up": In an NFL tie, nobody won and nobody lost. A tie is a push with 0 points awarded.
              </span>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* LAYOUT 3: PRINTABLE BLANK TAKE-HOME SLIP                     */}
        {/* ------------------------------------------------------------- */}
        {selectedLayout === 'blank_takehome' && (
          <div className="p-6 bg-white space-y-6 font-mono max-w-4xl mx-auto border border-slate-300 my-4 shadow-sm">
            <div className="text-center border-b-2 border-slate-900 pb-4">
              <h2 className="text-xl font-bold tracking-wider text-slate-900 uppercase">
                WEEK {currentActiveWeek} OFFICIAL SELECTION BALLOT
              </h2>
              <p className="text-xs italic text-slate-600 mt-1">
                Circle ONE team per matchup. Total points on Monday night used as tiebreaker.
              </p>
            </div>

            {/* Contender Entry Lines */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-slate-900 p-4 bg-slate-50/50">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Contender Name:</div>
                <div className="border-b-2 border-slate-900 h-7 pt-1 font-bold">
                  {activePlayer ? activePlayer.name : '________________________'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Monday Night Tiebreaker:</div>
                <div className="border-b-2 border-slate-900 h-7 pt-1 font-bold">
                  {activePlayer && picks[activePlayer.name]?.tiebreaker ? `${picks[activePlayer.name].tiebreaker} Total Points` : '____ Total Points'}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Phone or Email:</div>
                <div className="border-b-2 border-slate-900 h-7 pt-1 font-bold text-xs truncate">
                  {activePlayer?.email || '________________________'}
                </div>
              </div>
            </div>

            {/* 16 Games 2-Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {games.map(game => (
                <div 
                  key={game.gameNumber} 
                  className="border border-slate-800 p-2.5 bg-white flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded text-[10px]">
                      GAME {game.gameNumber}
                    </span>
                    <div className="text-[10px] text-slate-500">
                      {game.day} • {game.kickoffTime}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 font-bold text-sm">
                    <span className="px-2 py-1 border border-slate-300 rounded hover:border-slate-800 cursor-pointer">
                      {game.awayTeam}
                    </span>
                    <span className="text-slate-400 font-normal">@</span>
                    <span className="px-2 py-1 border border-slate-300 rounded hover:border-slate-800 cursor-pointer">
                      {game.homeTeam}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Monday Night Tiebreaker Box */}
            <div className="border-2 border-slate-900 p-4 bg-amber-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900 text-sm">
                  ★ MONDAY NIGHT FOOTBALL TIEBREAKER
                </div>
                <div className="text-xs text-slate-600">
                  Total combined points scored by both teams on Monday Night.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">MY PREDICTION:</span>
                <div className="border-2 border-slate-900 bg-white px-4 py-1.5 text-base font-bold text-center w-24">
                  ____ PTS
                </div>
              </div>
            </div>

            {/* Footnote */}
            <div className="text-[11px] text-center text-slate-500 border-t border-slate-200 pt-3">
              {getSavedPoolConfig().leagueName} • Straight-up wins • Monday Night Tiebreaker
            </div>
          </div>
        )}

        {/* SHEET FOOTER NOTES */}
        <div className={`p-3 ${theme.headerSubBg} ${theme.headerText} border-t-2 ${theme.accentBorder} flex flex-wrap items-center justify-between text-xs`}>
          <div className="flex items-center gap-2">
            <span className="font-bold">Format:</span>
            <span className="opacity-90">
              Straight-up wins • 1 point per win • MNF First-Place Tiebreaker (0 pts)
            </span>
          </div>
          <div className="font-mono text-[11px] opacity-80">
            16 Games + MNF Tiebreaker
          </div>
        </div>
      </div>
    </div>
  );
});
