import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { 
  CheckCircle2, 
  Lock, 
  Clock, 
  Trophy, 
  HelpCircle, 
  AlertCircle, 
  Sparkles, 
  Check, 
  RefreshCw, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Smartphone,
  LayoutGrid,
  List,
  User,
  Zap,
  Sliders
} from 'lucide-react';
import { Game, Player, PlayerPickData, SeasonHistory } from '../types';
import { HelpModal } from './HelpModal';
import { isGameLockedByKickoff } from '../utils/storageSanitizer';
import { isGameTie } from '../utils/nflTieEngine';
import { PoolSetupConfig, DEFAULT_POOL_CONFIG } from '../config/leagueConfig';
import { isAdminPinUnlocked, setAdminPinUnlocked, verifyAdminPin } from '../utils/adminAuth';

interface WeeklyPicksTabProps {
  games: Game[];
  players: Player[];
  activePlayer: Player | null;
  onSelectPlayer: (player: Player) => void;
  allPicks: Record<string, PlayerPickData>;
  onSavePicks: (contenderName: string, picks: Record<number, string>, tiebreaker: number | '', adminOverride?: boolean) => void;
  onViewLeaderboard: () => void;
  isCompactMode?: boolean;
  currentWeek?: number;
  seasonHistory?: SeasonHistory;
  poolConfig?: PoolSetupConfig;
}

interface WeeklyPickGameCardProps {
  game: Game;
  pickedTeam?: string;
  onPickTeam: (gameNumber: number, team: string) => void;
  isUnlockedOverride?: boolean;
  isCompact?: boolean;
  currentWeekNumber?: number;
}

/**
 * Dynamic week evaluator for the picks sheet.
 * Extracts the declared week from the active games or falls back cleanly.
 */
export function getDynamicPicksWeek(games: Game[], explicitWeek?: number): number {
  if (games && games.length > 0) {
    const declaredWeek = games.find(g => typeof g.week === 'number' && g.week > 0)?.week;
    if (declaredWeek) return declaredWeek;
  }
  if (explicitWeek && explicitWeek > 0) return explicitWeek;
  return 4;
}

const WeeklyPickGameCard: React.FC<WeeklyPickGameCardProps> = memo(({
  game,
  pickedTeam,
  onPickTeam,
  isUnlockedOverride = false,
  isCompact = false,
  currentWeekNumber
}) => {
  const effectiveWeek = game.week || currentWeekNumber || 4;
  const isAwayPicked = pickedTeam === game.awayTeam;
  const isHomePicked = pickedTeam === game.homeTeam;
  const isKickoffLocked = isGameLockedByKickoff(game);
  const isNaturallyLocked = game.status === 'final' || game.status === 'in_progress' || isKickoffLocked;
  const isLocked = isNaturallyLocked && !isUnlockedOverride;

  const handleTeamClick = (team: string) => {
    if (isLocked) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    } catch (e) {}
    onPickTeam(game.gameNumber, team);
  };

  // COMPACT HIGH-DENSITY ROW (Optimized for Mobile scrolling & 1-tap picking)
  if (isCompact) {
    return (
      <div
        className={`bg-white rounded-xl p-2.5 sm:p-3 border transition-all ${
          isLocked 
            ? 'border-slate-300/80 bg-slate-50/70 opacity-90' 
            : pickedTeam 
              ? 'border-emerald-500 bg-emerald-50/20 shadow-2xs ring-1 ring-emerald-400/40' 
              : 'border-slate-200 hover:border-slate-300 shadow-2xs'
        }`}
      >
        {/* Top Mini Header */}
        <div className="flex items-center justify-between text-[11px] mb-1.5 pb-1 border-b border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-black text-emerald-950 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded text-[10px] shadow-2xs">
              Week {effectiveWeek} • Game {game.gameNumber}
            </span>
            <span className="text-slate-600 font-semibold text-[10px]">
              {game.day} • {game.kickoffTime}
            </span>
            {game.spread && (
              <span className="text-[10px] text-slate-700 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                Line: {game.spread}
              </span>
            )}
            {game.isMNF && (
              <span className="bg-purple-100 text-purple-900 font-black text-[9px] px-1.5 py-0.2 rounded border border-purple-200">
                ★ MNF TB
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isUnlockedOverride && isNaturallyLocked && (
              <span className="text-[9px] font-black text-amber-900 bg-amber-200 px-1.5 py-0.2 rounded border border-amber-300">
                🔓 Unlocked
              </span>
            )}
            {game.status === 'final' && (
              isGameTie(game) ? (
                <span className="text-[10px] font-bold text-sky-950 bg-sky-100 border border-sky-300 px-1.5 py-0.2 rounded shadow-2xs">
                  ⚖️ Final: TIE
                </span>
              ) : (
                <span className="text-[10px] font-bold text-slate-700 bg-slate-200/80 px-1.5 py-0.2 rounded">
                  Final: {game.officialWinner}
                </span>
              )
            )}
            {game.status === 'in_progress' && (
              <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-1.5 py-0.2 rounded animate-pulse">
                Live ({game.awayScore}-{game.homeScore})
              </span>
            )}
            {game.status === 'scheduled' && (
              isKickoffLocked ? (
                <span className="text-[10px] font-bold text-slate-700 bg-slate-200/90 px-1.5 py-0.2 rounded border border-slate-300">
                  🔒 Locked (Kickoff)
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/80 px-1.5 py-0.2 rounded">
                  {pickedTeam ? '✓ Picked' : 'Open'}
                </span>
              )
            )}
          </div>
        </div>

        {/* Dense Horizontal Pick Buttons */}
        <div className="grid grid-cols-2 gap-2">
          {/* Away Team Pill */}
          <button
            type="button"
            disabled={isLocked}
            onClick={() => handleTeamClick(game.awayTeam)}
            className={`flex items-center justify-between px-2.5 py-2 rounded-lg border transition-all select-none active:scale-[0.98] ${
              isLocked
                ? isAwayPicked
                  ? isGameTie(game)
                    ? 'bg-sky-100/90 text-sky-950 border-sky-400 font-bold opacity-95 ring-1 ring-sky-300'
                    : 'bg-emerald-800 text-white border-emerald-900 font-bold opacity-90'
                  : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                : isAwayPicked
                  ? 'bg-[#1b3a2b] text-white border-emerald-600 font-black shadow-xs ring-2 ring-emerald-400'
                  : 'bg-slate-50 hover:bg-emerald-50/60 text-slate-800 border-slate-300 hover:border-emerald-400 font-bold'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] opacity-75 font-semibold text-slate-400">
                (Away)
              </span>
              <span className="text-xs sm:text-sm font-extrabold truncate">
                {game.awayTeam}
              </span>
              {game.awayRecord && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                  isAwayPicked ? 'text-emerald-100 bg-emerald-950/80 border border-emerald-600/50' : 'text-slate-600 bg-slate-100 border border-slate-300/80'
                }`}>
                  {game.awayRecord}
                </span>
              )}
              {game.favorite === game.awayTeam && (
                <span className="text-[10px] text-amber-300 font-black" title="Vegas Favorite">★</span>
              )}
            </div>
            {isAwayPicked ? (
              <span className={`text-[11px] font-black px-1.5 py-0.5 rounded ml-1 shrink-0 ${
                isGameTie(game)
                  ? 'text-sky-900 bg-sky-200/90 border border-sky-300'
                  : 'text-emerald-300 bg-emerald-900/90'
              }`}>
                {isGameTie(game) ? '⚖️ Push' : '✓'}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium">
                {game.awayRecord || ''}
              </span>
            )}
          </button>

          {/* Home Team Pill */}
          <button
            type="button"
            disabled={isLocked}
            onClick={() => handleTeamClick(game.homeTeam)}
            className={`flex items-center justify-between px-2.5 py-2 rounded-lg border transition-all select-none active:scale-[0.98] ${
              isLocked
                ? isHomePicked
                  ? isGameTie(game)
                    ? 'bg-sky-100/90 text-sky-950 border-sky-400 font-bold opacity-95 ring-1 ring-sky-300'
                    : 'bg-emerald-800 text-white border-emerald-900 font-bold opacity-90'
                  : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                : isHomePicked
                  ? 'bg-[#1b3a2b] text-white border-emerald-600 font-black shadow-xs ring-2 ring-emerald-400'
                  : 'bg-slate-50 hover:bg-emerald-50/60 text-slate-800 border-slate-300 hover:border-emerald-400 font-bold'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] opacity-75 font-semibold text-slate-400">
                (Home)
              </span>
              <span className="text-xs sm:text-sm font-extrabold truncate">
                {game.homeTeam}
              </span>
              {game.homeRecord && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                  isHomePicked ? 'text-emerald-100 bg-emerald-950/80 border border-emerald-600/50' : 'text-slate-600 bg-slate-100 border border-slate-300/80'
                }`}>
                  {game.homeRecord}
                </span>
              )}
              {game.favorite === game.homeTeam && (
                <span className="text-[10px] text-amber-300 font-black" title="Vegas Favorite">★</span>
              )}
            </div>
            {isHomePicked ? (
              <span className={`text-[11px] font-black px-1.5 py-0.5 rounded ml-1 shrink-0 ${
                isGameTie(game)
                  ? 'text-sky-900 bg-sky-200/90 border border-sky-300'
                  : 'text-emerald-300 bg-emerald-900/90'
              }`}>
                {isGameTie(game) ? '⚖️ Push' : '✓'}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium">
                {game.homeRecord || ''}
              </span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // STANDARD CARDS VIEW
  return (
    <div
      className={`bg-white rounded-xl p-3.5 sm:p-4 border transition-all ${
        isLocked 
          ? 'border-slate-300/80 bg-slate-50/70 opacity-90' 
          : pickedTeam 
            ? 'border-emerald-500 bg-emerald-50/30 shadow-xs ring-1 ring-emerald-400/50' 
            : 'border-slate-200 hover:border-slate-300 shadow-xs'
      }`}
    >
      {/* Game Header */}
      <div className="flex items-center justify-between text-xs mb-2.5 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-emerald-950 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded text-[11px] shadow-2xs">
            Week {effectiveWeek} • Game {game.gameNumber}
          </span>
          <span className="text-slate-600 font-semibold">
            {game.day} • {game.kickoffTime}
          </span>
          {game.spread && (
            <span className="text-[11px] text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Line: {game.spread}
            </span>
          )}
          {game.isMNF && (
            <span className="bg-purple-100 text-purple-900 font-extrabold text-[10px] px-2 py-0.5 rounded border border-purple-300 shadow-2xs">
              ★ MNF Tiebreaker Game
            </span>
          )}
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-1.5">
          {isUnlockedOverride && isNaturallyLocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-900 bg-amber-200 px-2 py-0.5 rounded border border-amber-300">
              🔓 Unlocked
            </span>
          )}
          {game.status === 'final' && (
            isGameTie(game) ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-950 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded shadow-2xs">
                <span>⚖️</span>
                Final: TIE (Push)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded">
                <Lock className="w-3 h-3 text-slate-500" />
                Final: {game.officialWinner}
              </span>
            )
          )}
          {game.status === 'in_progress' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-200/90 px-2 py-0.5 rounded animate-pulse shadow-2xs">
              <Clock className="w-3 h-3 text-amber-800" />
              Live: {game.quarter || '4Q'} ({game.awayScore} - {game.homeScore})
            </span>
          )}
          {game.status === 'scheduled' && (
            isKickoffLocked ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-200 px-2.5 py-0.5 rounded-full border border-slate-300">
                <Lock className="w-3 h-3 text-slate-500" />
                Locked (Kickoff Passed)
              </span>
            ) : (
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                ✓ Open to Pick
              </span>
            )
          )}
        </div>
      </div>

      {/* Matchup Selection Grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {/* Away Team Button */}
        <button
          type="button"
          disabled={isLocked}
          onClick={() => handleTeamClick(game.awayTeam)}
          className={`flex flex-col items-center justify-center min-h-[64px] sm:min-h-[70px] p-3 sm:p-3.5 rounded-xl border-2 transition-all text-center select-none active:scale-[0.98] ${
            isLocked
              ? isAwayPicked
                ? 'bg-emerald-800 text-white border-emerald-900 font-bold opacity-90'
                : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
              : isAwayPicked
                ? 'bg-[#1b3a2b] text-white border-emerald-600 font-black shadow-md ring-2 ring-emerald-400'
                : 'bg-slate-50 hover:bg-emerald-50/60 text-slate-800 border-slate-300 hover:border-emerald-400 font-bold'
          }`}
          style={{ touchAction: 'manipulation' }}
        >
          <div className="text-[11px] text-slate-500 font-medium mb-0.5">
            Away Team
          </div>
          <div className="text-sm sm:text-base font-black flex items-center justify-center gap-1">
            <span>{game.awayTeam}</span>
            {game.favorite === game.awayTeam && (
              <span className="text-amber-400 text-xs" title="Vegas Favorite">★</span>
            )}
          </div>
          {game.awayRecord && (
            <div className={`text-xs font-bold px-2.5 py-0.5 rounded-full mt-1.5 border ${
              isAwayPicked ? 'text-emerald-100 bg-emerald-950/80 border-emerald-600/60' : 'text-slate-700 bg-slate-100 border-slate-300'
            }`}>
              Record: {game.awayRecord}
            </div>
          )}
          {isAwayPicked && (
            <div className="mt-1 flex items-center gap-1 text-[11px] font-black text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3 text-emerald-300" />
              <span>YOUR PICK</span>
            </div>
          )}
        </button>

        {/* Home Team Button */}
        <button
          type="button"
          disabled={isLocked}
          onClick={() => handleTeamClick(game.homeTeam)}
          className={`flex flex-col items-center justify-center min-h-[64px] sm:min-h-[70px] p-3 sm:p-3.5 rounded-xl border-2 transition-all text-center select-none active:scale-[0.98] ${
            isLocked
              ? isHomePicked
                ? 'bg-emerald-800 text-white border-emerald-900 font-bold opacity-90'
                : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
              : isHomePicked
                ? 'bg-[#1b3a2b] text-white border-emerald-600 font-black shadow-md ring-2 ring-emerald-400'
                : 'bg-slate-50 hover:bg-emerald-50/60 text-slate-800 border-slate-300 hover:border-emerald-400 font-bold'
          }`}
          style={{ touchAction: 'manipulation' }}
        >
          <div className="text-[11px] text-slate-500 font-medium mb-0.5">
            Home Team
          </div>
          <div className="text-sm sm:text-base font-black flex items-center justify-center gap-1">
            <span>{game.homeTeam}</span>
            {game.favorite === game.homeTeam && (
              <span className="text-amber-400 text-xs" title="Vegas Favorite">★</span>
            )}
          </div>
          {game.homeRecord && (
            <div className={`text-xs font-bold px-2.5 py-0.5 rounded-full mt-1.5 border ${
              isHomePicked ? 'text-emerald-100 bg-emerald-950/80 border-emerald-600/60' : 'text-slate-700 bg-slate-100 border-slate-300'
            }`}>
              Record: {game.homeRecord}
            </div>
          )}
          {isHomePicked && (
            <div className="mt-1 flex items-center gap-1 text-[11px] font-black text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3 text-emerald-300" />
              <span>YOUR PICK</span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
});

export const WeeklyPicksTab: React.FC<WeeklyPicksTabProps> = memo(({
  games,
  players,
  activePlayer,
  onSelectPlayer,
  allPicks,
  onSavePicks,
  onViewLeaderboard,
  isCompactMode = true,
  currentWeek,
  seasonHistory,
  poolConfig = DEFAULT_POOL_CONFIG
}) => {
  const activeWeekNumber = useMemo(() => getDynamicPicksWeek(games, currentWeek), [games, currentWeek]);

  // Determine latest compiled week and current reigning weekly winner for banner
  const latestCompiledWeek = seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0
    ? Math.max(...seasonHistory.compiledWeeks)
    : 1;

  const reigningWinnerInfo = useMemo(() => {
    if (!seasonHistory?.records) return null;
    let champName = '';
    let champWins = 0;
    for (const [name, rec] of Object.entries(seasonHistory.records) as [string, any][]) {
      const wkData = rec?.weeklyBreakdown?.[latestCompiledWeek];
      if (wkData?.isWinner) {
        champName = name;
        champWins = wkData.wins ?? 0;
        break;
      }
    }
    if (!champName) {
      let maxW = -1;
      for (const [name, rec] of Object.entries(seasonHistory.records) as [string, any][]) {
        const wWins = rec?.weeklyBreakdown?.[latestCompiledWeek]?.wins ?? -1;
        if (wWins > maxW) {
          maxW = wWins;
          champName = name;
          champWins = wWins;
        }
      }
    }
    return champName ? { name: champName, wins: champWins, week: latestCompiledWeek } : null;
  }, [seasonHistory, latestCompiledWeek]);

  // Local state for the current active form
  const [selectedPicks, setSelectedPicks] = useState<Record<number, string>>({});
  const [tiebreakerInput, setTiebreakerInput] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isUnlockedOverride, setIsUnlockedOverride] = useState<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tbDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Layout & Collapsible states
  const [viewStyle, setViewStyle] = useState<'compact' | 'cards'>(() => isCompactMode ? 'compact' : 'cards');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => isAdminPinUnlocked());
  const isAdminUser = Boolean(activePlayer?.role === 'admin' || isAdminUnlocked);
  const [isContenderGridOpen, setIsContenderGridOpen] = useState<boolean>(() => !activePlayer);
  const prevPlayerRef = useRef<string | null>(null);
  const prevWeekRef = useRef<number>(activeWeekNumber);

  useEffect(() => {
    const syncAuth = () => setIsAdminUnlocked(isAdminPinUnlocked());
    window.addEventListener('admin_auth_changed', syncAuth);
    return () => window.removeEventListener('admin_auth_changed', syncAuth);
  }, []);

  // Ensure non-admin contenders have their switcher grid closed once their identity is selected
  useEffect(() => {
    if (activePlayer && !isAdminUser) {
      setIsContenderGridOpen(false);
      setIsUnlockedOverride(false);
    }
  }, [activePlayer, isAdminUser]);

  const handleRequestAdminSwitch = () => {
    if (isAdminUser) {
      setIsContenderGridOpen(prev => !prev);
      return;
    }
    const pin = window.prompt('Pool Admin Only: Enter the 4-digit Pool Admin PIN to switch contenders or enter picks on another contender\'s behalf:');
    if (pin !== null) {
      if (verifyAdminPin(pin)) {
        setAdminPinUnlocked(true);
        setIsAdminUnlocked(true);
        setIsContenderGridOpen(true);
      } else {
        window.alert('Incorrect Admin PIN. Only Pool Admins can switch contenders and input picks on another contender\'s behalf.');
      }
    }
  };

  // Clear pick sheet when pool advances to a new week
  useEffect(() => {
    if (prevWeekRef.current !== activeWeekNumber) {
      prevWeekRef.current = activeWeekNumber;
      setSelectedPicks({});
      setTiebreakerInput('');
      setErrorMessage(null);
    }
  }, [activeWeekNumber]);

  // Sync state when activePlayer or allPicks change
  useEffect(() => {
    if (activePlayer) {
      const isNewPlayer = prevPlayerRef.current !== activePlayer.name;
      prevPlayerRef.current = activePlayer.name;
      const existing = allPicks[activePlayer.name];

      if (isNewPlayer) {
        // Load this player's actual picks from storage, preserving any draft selections made prior to picking name
        setSelectedPicks(prevDraft => {
          if (existing && Object.keys(existing.picks || {}).length > 0) {
            return { ...existing.picks };
          }
          if (Object.keys(prevDraft).length > 0) {
            // Contender clicked picks before choosing name - auto-save them now under this contender!
            onSavePicks(activePlayer.name, prevDraft, tiebreakerInput ? Number(tiebreakerInput) : 45, isUnlockedOverride);
            setSaveStatus('saved');
          }
          return { ...prevDraft };
        });
        if (existing && existing.tiebreaker !== undefined && existing.tiebreaker !== '') {
          setTiebreakerInput(String(existing.tiebreaker));
        } else if (!tiebreakerInput) {
          setTiebreakerInput('');
        }
      } else if (existing) {
        // If picks were reset to a clean slate (0 picks submitted for new week)
        if (Object.keys(existing.picks || {}).length === 0) {
          setSelectedPicks({});
          setTiebreakerInput('');
        } else {
          // Merge in background cloud updates while filtering any stale teams not in current games
          setSelectedPicks(prev => {
            const merged = { ...existing.picks, ...prev };
            const validMerged: Record<number, string> = {};
            for (const [gNumStr, teamVal] of Object.entries(merged)) {
              if (typeof teamVal !== 'string' || !teamVal) continue;
              const gNum = parseInt(gNumStr, 10);
              const g = games.find(item => item.gameNumber === gNum);
              if (g) {
                const away = g.awayTeam.toLowerCase();
                const home = g.homeTeam.toLowerCase();
                const picked = teamVal.toLowerCase();
                if (away.includes(picked) || picked.includes(away) || home.includes(picked) || picked.includes(home)) {
                  validMerged[gNum] = teamVal;
                }
              }
            }
            return validMerged;
          });
          if (existing.tiebreaker !== undefined && existing.tiebreaker !== '' && !tiebreakerInput) {
            setTiebreakerInput(String(existing.tiebreaker));
          }
        }
      }
      setErrorMessage(null);
    }
  }, [activePlayer, allPicks, games]);

  // Clean up debounce timers
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (tbDebounceRef.current) clearTimeout(tbDebounceRef.current);
    };
  }, []);

  // Instant Auto-Save on Every Pick Tap
  const handlePickTeam = (gameNumber: number, team: string) => {
    const updated = {
      ...selectedPicks,
      [gameNumber]: team
    };
    setSelectedPicks(updated);
    setErrorMessage(null);

    if (activePlayer) {
      setSaveStatus('saving');
      const existingTb = allPicks[activePlayer.name]?.tiebreaker;
      let tbNumber: number | '' = existingTb !== undefined && existingTb !== '' ? existingTb : 45;
      if (tiebreakerInput.trim() !== '') {
        const parsed = Number(tiebreakerInput);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 150) {
          tbNumber = parsed;
        }
      }
      onSavePicks(activePlayer.name, updated, tbNumber, isUnlockedOverride);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved');
      }, 350);
    } else {
      // Prompt contender to pick their name to lock and auto-save
      setIsContenderGridOpen(true);
    }
  };

  // Debounced Auto-Save for MNF Combined Points Tiebreaker (400ms)
  const handleTiebreakerChange = (val: string) => {
    setTiebreakerInput(val);
    setErrorMessage(null);
    if (!activePlayer) return;

    if (tbDebounceRef.current) clearTimeout(tbDebounceRef.current);
    tbDebounceRef.current = setTimeout(() => {
      let tbNumber: number | '' = '';
      if (val.trim() !== '') {
        const parsed = Number(val);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 150) {
          tbNumber = parsed;
        }
      }
      setSaveStatus('saving');
      const effectiveContenderPicks = {
        ...(allPicks[activePlayer.name]?.picks || {}),
        ...selectedPicks
      };
      onSavePicks(activePlayer.name, effectiveContenderPicks, tbNumber, isUnlockedOverride);

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved');
      }, 350);
    }, 400);
  };

  // Quick helper to fill remaining unpicked games with favorites and auto-save
  const handleQuickFillFavorites = () => {
    const updated: Record<number, string> = { ...selectedPicks };
    games.forEach(g => {
      if (!updated[g.gameNumber] && !isGameLockedByKickoff(g)) {
        updated[g.gameNumber] = g.favorite || g.homeTeam;
      }
    });
    setSelectedPicks(updated);
    let newTb = tiebreakerInput;
    if (!newTb) {
      const mnfGame = games.find(g => g.isMNF);
      if (mnfGame?.overUnder) {
        newTb = String(Math.round(mnfGame.overUnder));
        setTiebreakerInput(newTb);
      }
    }
    setErrorMessage(null);

    if (activePlayer) {
      setSaveStatus('saving');
      const tbNum = newTb.trim() !== '' ? Number(newTb) : (allPicks[activePlayer.name]?.tiebreaker ?? 45);
      onSavePicks(activePlayer.name, updated, tbNum, isUnlockedOverride);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved');
      }, 350);
    }
  };

  const handleClearPicks = () => {
    if (window.confirm("Clear all your pick selections on this sheet?")) {
      setSelectedPicks({});
      setTiebreakerInput('');
      if (activePlayer) {
        setSaveStatus('saving');
        onSavePicks(activePlayer.name, {}, '', isUnlockedOverride);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          setSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved');
        }, 350);
      }
    }
  };

  const effectivePicks = activePlayer ? { ...(allPicks[activePlayer.name]?.picks || {}), ...selectedPicks } : selectedPicks;
  const pickedCount = Object.keys(effectivePicks).filter(k => effectivePicks[Number(k)]).length;
  const isComplete = pickedCount === games.length && games.length > 0;
  // Filter out the automated Vegas Bot so human pick sheets only show human contenders
  const activeContenders = players.filter(p => p.isActive !== false && !p.isElvis && p.id !== 'elvis');

  return (
    <div className="max-w-3xl mx-auto py-3 px-2 sm:px-4 pb-20 md:pb-8">
      {/* Reigning Weekly Champion Spotlight Banner */}
      {reigningWinnerInfo && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-400/20 to-emerald-500/10 border-2 border-amber-400/70 rounded-2xl p-3 sm:p-3.5 mb-3 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl select-none shrink-0">👑</span>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                Reigning Week {reigningWinnerInfo.week} Champion
              </div>
              <div className="text-sm font-black text-emerald-950 truncate flex items-center gap-1.5">
                <span>{reigningWinnerInfo.name}</span>
                <span className="text-xs font-extrabold text-amber-800 bg-amber-100/90 px-2 py-0.2 rounded-md border border-amber-300 shrink-0">
                  {reigningWinnerInfo.wins} Wins
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onViewLeaderboard}
            className="hidden sm:inline-flex items-center gap-1 bg-amber-200/90 hover:bg-amber-300/90 text-amber-950 text-xs font-black px-2.5 py-1 rounded-lg border border-amber-300 transition-all cursor-pointer shrink-0"
          >
            <span>View Standings Vault</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1-Tap Contender Selector Banner (Collapsible to save vertical screen space) */}
      <div className="bg-white rounded-2xl p-3 sm:p-4 border-2 border-emerald-700/30 shadow-2xs mb-3">
        {/* Header with Title & Collapse Toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 shrink-0">
              Step 1
            </span>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-slate-900 truncate">
                {activePlayer ? `Contender: ${activePlayer.name}` : 'Tap Your Name to Begin'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Toggle Full Grid (Admins can freely switch; Non-admins are locked to their own profile once chosen) */}
            {(!activePlayer || isAdminUser) ? (
              <button
                type="button"
                onClick={() => setIsContenderGridOpen(prev => !prev)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-200 cursor-pointer"
              >
                {isContenderGridOpen ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Hide Grid</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>{activePlayer ? `Admin Switch (${activeContenders.length})` : 'Show Roster'}</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRequestAdminSwitch}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold border border-slate-300 cursor-pointer"
                title="Contenders can only enter their own picks. Pool Admins can enter PIN to switch contenders."
              >
                <Lock className="w-3 h-3 text-slate-600" />
                <span>Admin Switch</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
              title="Help & phone home screen instructions"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-700" />
              <span>Rules</span>
            </button>
          </div>
        </div>

        {/* Collapsible 1-Tap Name Grid */}
        {(isContenderGridOpen && (!activePlayer || isAdminUser)) ? (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-600 mb-2">
              {isAdminUser
                ? 'Admin Mode Active: Tap any contender below to view or enter picks on their behalf.'
                : 'Tap your name below to lock this device to your contender sheet. (Only Pool Admins can enter picks for other contenders.)'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 mb-2">
              {activeContenders.map(p => {
                const isSelected = activePlayer?.id === p.id;
                const hasExistingPicks = !!allPicks[p.name]?.picks && Object.keys(allPicks[p.name].picks).length > 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (activePlayer && !isAdminUser && p.id !== activePlayer.id) {
                        handleRequestAdminSwitch();
                        return;
                      }
                      if (p.role === 'admin' && !isAdminUser) {
                        const pin = window.prompt(`Enter the 4-digit Pool Admin PIN to sign in as ${p.name}:`);
                        if (pin === null) return;
                        if (!verifyAdminPin(pin)) {
                          window.alert('Incorrect Admin PIN.');
                          return;
                        }
                        setAdminPinUnlocked(true);
                        setIsAdminUnlocked(true);
                      }
                      onSelectPlayer(p);
                      if (window.innerWidth < 768 || p.role !== 'admin') {
                        setIsContenderGridOpen(false);
                      }
                    }}
                    className={`flex items-center justify-between px-2.5 py-2 rounded-xl font-black text-xs border-2 transition-all cursor-pointer select-none active:scale-95 ${
                      isSelected
                        ? 'bg-[#1b3a2b] text-white border-emerald-500 shadow-md ring-2 ring-emerald-400'
                        : 'bg-slate-50 hover:bg-emerald-50 text-slate-800 border-slate-200 hover:border-emerald-300'
                    }`}
                    style={{ touchAction: 'manipulation' }}
                  >
                    <div className="flex items-center gap-1 truncate">
                      {p.role === 'admin' && <span title="Pool Admin" className="text-[10px]">★</span>}
                      {p.isDefendingChamp && <span title="Defending Champ">🏆</span>}
                      <span className="truncate">{p.name}</span>
                    </div>
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                    ) : hasExistingPicks ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Picks on file" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Slim Collapsed Status Banner */
          <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5 text-xs">
            <div className="text-emerald-950 font-medium flex items-center gap-1.5 truncate">
              <span>Picking for:</span>
              <strong className="font-black text-emerald-900 text-xs sm:text-sm truncate">
                {activePlayer ? activePlayer.name : 'No contender selected'}
              </strong>
              {activePlayer?.role === 'admin' && (
                <span className="bg-amber-200 text-amber-950 text-[10px] font-black px-1.5 py-0.2 rounded border border-amber-400">
                  Admin
                </span>
              )}
            </div>
            {(!activePlayer || isAdminUser) ? (
              <button
                type="button"
                onClick={() => setIsContenderGridOpen(true)}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer shrink-0 ml-2"
              >
                {activePlayer ? 'Switch Contender' : 'Select Name'}
              </button>
            ) : (
              <span className="text-[10px] font-bold text-emerald-800 flex items-center gap-1 shrink-0 ml-2">
                <Lock className="w-3 h-3 text-emerald-700" />
                <span>Identity Locked</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Week Schedule & Controls Banner (Slim & Collapsible) */}
      <div className="bg-[#1b3a2b] text-white rounded-2xl p-3 sm:p-4 mb-3 shadow-md">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
              {poolConfig.leagueName} Straight-Up Sheet
            </div>
            <h3 className="text-sm sm:text-base font-black text-white">
              Week {activeWeekNumber} Picks ({games.length} Matchups)
            </h3>
          </div>
          
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* View Mode Toggle: Dense Compact vs Cards */}
            <div className="flex items-center bg-emerald-950/90 p-0.5 rounded-lg border border-emerald-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewStyle('compact')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  viewStyle === 'compact' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-emerald-200 hover:text-white'
                }`}
                title="Compact row view - fits more games on screen"
              >
                <List className="w-3 h-3" />
                <span className="hidden sm:inline">Compact</span>
              </button>
              <button
                type="button"
                onClick={() => setViewStyle('cards')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  viewStyle === 'cards' ? 'bg-amber-400 text-slate-950 shadow-xs' : 'text-emerald-200 hover:text-white'
                }`}
                title="Card view with big buttons"
              >
                <LayoutGrid className="w-3 h-3" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            {/* Pick Progress Counter */}
            <div className="bg-emerald-900/90 border border-emerald-600/80 px-2.5 py-1 rounded-lg text-xs font-black text-white flex items-center gap-1 shadow-2xs">
              <CheckCircle2 className={`w-3.5 h-3.5 ${isComplete ? 'text-emerald-400' : 'text-amber-300'}`} />
              <span>{pickedCount}/{games.length}</span>
            </div>

            {/* Unlock All Toggle (Admin Only) */}
            {isAdminUser && (
              <button
                type="button"
                onClick={() => setIsUnlockedOverride(prev => !prev)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border flex items-center gap-1 ${
                  isUnlockedOverride 
                    ? 'bg-amber-400 text-slate-950 border-amber-300 font-black' 
                    : 'bg-emerald-800/80 text-emerald-200 border-emerald-600 hover:bg-emerald-700 hover:text-white'
                }`}
                title="Admin Only: Unlock past kickoff games to edit"
              >
                <Lock className="w-3 h-3" />
                <span className="hidden sm:inline">{isUnlockedOverride ? 'Unlocked' : 'Admin Unlock'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Shortcuts Bar */}
        <div className="mt-2.5 pt-2 border-t border-emerald-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="text-emerald-200/90 text-[11px] font-medium hidden sm:inline">
            Tap either <strong>Away</strong> or <strong>Home</strong> on each game.
          </div>
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
            <button
              type="button"
              onClick={handleQuickFillFavorites}
              className="text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-emerald-900/70 hover:bg-emerald-850 px-2.5 py-1 rounded-lg border border-emerald-700 cursor-pointer flex items-center gap-1"
            >
              <Zap className="w-3 h-3 text-amber-300" />
              <span>Auto-Fill Favorites</span>
            </button>
            {pickedCount > 0 && (
              <button
                type="button"
                onClick={handleClearPicks}
                className="text-[11px] font-bold text-rose-300 hover:text-rose-200 bg-emerald-900/70 hover:bg-emerald-850 px-2.5 py-1 rounded-lg border border-emerald-700 cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-3 bg-red-50 border-2 border-red-400 p-3 rounded-xl flex items-start gap-2.5 text-xs text-red-900 shadow-sm animate-bounce">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="font-bold">{errorMessage}</div>
        </div>
      )}

      {/* Ambient Live Auto-Save Status Banner */}
      <div className="mb-3 bg-white border border-emerald-300/80 p-2.5 sm:p-3 rounded-xl flex items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black shrink-0 ${
            saveStatus === 'saving' 
              ? 'bg-amber-100 text-amber-800 animate-spin' 
              : saveStatus === 'offline' 
                ? 'bg-amber-100 text-amber-900' 
                : 'bg-emerald-100 text-emerald-800'
          }`}>
            {saveStatus === 'saving' ? '⏳' : saveStatus === 'offline' ? '⚠️' : '✓'}
          </span>
          <div className="text-xs text-slate-800 font-bold min-w-0 truncate">
            <span className="font-black text-emerald-950">
              {saveStatus === 'saving' 
                ? 'Auto-Saving to Cloud...' 
                : saveStatus === 'offline' 
                  ? 'Saved Locally (Offline)' 
                  : 'All Picks Auto-Saved'}
            </span>
            <span className="text-slate-600 ml-1.5 font-medium hidden sm:inline">
              ({pickedCount} of {games.length} games selected • Editable until kickoff)
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onViewLeaderboard}
          className="text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-all shrink-0 cursor-pointer flex items-center gap-1 active:scale-95"
        >
          <span>Standings Matrix</span>
          <ChevronRight className="w-3.5 h-3.5 text-emerald-700" />
        </button>
      </div>

      {/* 16 Matchup Cards / Rows */}
      <div className={viewStyle === 'compact' ? 'space-y-2' : 'space-y-3'}>
        {games.map((game) => (
          <WeeklyPickGameCard
            key={game.gameNumber}
            game={game}
            pickedTeam={selectedPicks[game.gameNumber]}
            onPickTeam={handlePickTeam}
            isUnlockedOverride={isUnlockedOverride}
            isCompact={viewStyle === 'compact'}
            currentWeekNumber={activeWeekNumber}
          />
        ))}

        {/* Monday Night Tiebreaker Card with Live Auto-Save */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border-2 border-purple-400 shadow-sm mt-4">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-purple-900 bg-purple-100 px-2 py-0.5 rounded-full border border-purple-300">
                Official Tiebreaker
              </span>
              <h3 className="text-sm sm:text-base font-black text-slate-900 mt-0.5">
                🏈 Monday Night Combined Points Prediction
              </h3>
            </div>
            <span className="text-[10px] font-black text-purple-800 bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200">
              1st Place Decider
            </span>
          </div>

          <p className="text-xs text-slate-600 mb-3 leading-relaxed font-medium">
            Closest guess to total combined MNF score wins weekly tiebreakers. Automatically saved upon entry.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="w-full sm:w-1/2">
              <label htmlFor="tiebreaker-field" className="block text-[11px] font-black text-slate-800 uppercase mb-1">
                Your Total Points Guess
              </label>
              <input
                id="tiebreaker-field"
                type="number"
                min="0"
                max="150"
                step="1"
                placeholder="e.g. 45"
                value={tiebreakerInput}
                onChange={(e) => handleTiebreakerChange(e.target.value)}
                className="w-full bg-purple-50/50 border-2 border-purple-400 rounded-xl px-3.5 py-2.5 text-lg font-black text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                style={{ touchAction: 'manipulation' }}
              />
            </div>

            <div className="w-full sm:w-1/2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
              <div className="font-black text-slate-900 mb-0.5">
                Pool Tiebreaker Rule:
              </div>
              <div className="text-slate-600 leading-relaxed text-[11px]">
                Applies solely to resolve a tie for <strong>1st place weekly rank</strong>. <strong>0 bonus points</strong> awarded.
              </div>
            </div>
          </div>
        </div>

        {/* Ambient Auto-Save Reassurance & Direct Matrix Link */}
        <div className="pt-3 pb-8">
          <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-2xl p-4 sm:p-5 text-center shadow-xs">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wider">
                Instant Auto-Save Active
              </span>
            </div>
            <p className="text-xs sm:text-sm text-emerald-900 font-medium max-w-lg mx-auto leading-relaxed mb-3">
              Every pick you tap is auto-saved immediately to your device and synchronized with the master pool ledger. 
              You can adjust any selection anytime before each game kicks off.
              {poolConfig.enableAutoVegasFavoritesFallback !== false && (
                <span className="block mt-1 text-[11px] text-emerald-800 font-bold">
                  ★ Dad&apos;s Rule Active: Unpicked games at kickoff receive Vegas Favorites automatically so no contender takes a zero.
                </span>
              )}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                type="button"
                onClick={onViewLeaderboard}
                className="w-full sm:w-auto bg-[#1b3a2b] hover:bg-[#142d21] text-amber-300 hover:text-amber-200 font-black py-3 px-6 rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95 border border-emerald-600"
              >
                <Trophy className="w-4 h-4 text-amber-300" />
                <span>View Full Standings & Score Matrix</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY BOTTOM AUTO-SAVE STATUS & STANDINGS DOCK */}
      <div className="md:hidden fixed bottom-14 left-0 right-0 z-30 px-3 py-2 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 shadow-xl flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            saveStatus === 'saving' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
          }`} />
          <div className="min-w-0">
            <div className="text-[11px] font-black text-white truncate flex items-center gap-1">
              <span>{saveStatus === 'saving' ? 'Auto-Saving...' : '✓ Auto-Saved'}</span>
              <span className="text-emerald-300 font-bold">({pickedCount}/{games.length})</span>
            </div>
            <div className="text-[9px] text-slate-400 truncate">
              {activePlayer ? activePlayer.name : 'No name selected'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onViewLeaderboard}
          className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1 shadow-sm shrink-0 active:scale-95 cursor-pointer"
        >
          <span>Standings</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Help & Setup Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
});
