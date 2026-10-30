import React, { memo, useState, useEffect } from 'react';
import { 
  Trophy, 
  CalendarDays, 
  FileSpreadsheet, 
  ScrollText, 
  MessageSquare, 
  ShieldCheck, 
  User, 
  Newspaper, 
  ChevronDown, 
  ChevronUp,
  HelpCircle,
  RefreshCw,
  Radio,
  Sliders,
  Sparkles,
  Smartphone,
  Maximize2,
  Minimize2,
  X,
  Coins,
  Lock
} from 'lucide-react';
import { Game, Player } from '../types';
import { AnniversaryBadge } from './AnniversaryBadge';
import { LiveScoreboardTicker } from './LiveScoreboardTicker';
import { isAdminPinUnlocked } from '../utils/adminAuth';
import { PoolSetupConfig, getSavedPoolConfig } from '../config/leagueConfig';

export type TabId = 'picks' | 'leaderboard' | 'consultant' | 'wire' | 'locker' | 'admin';

interface NavigationProps {
  currentTab: TabId;
  onSelectTab: (tab: TabId) => void;
  activePlayer: Player | null;
  allPlayers: Player[];
  onSelectPlayer: (player: Player | null) => void;
  onOpenHelp: () => void;
  onOpenFineJar?: () => void;
  onOpenSetupWizard?: () => void;
  poolConfig?: PoolSetupConfig;
  // Global live scoring and scoreboard controls
  games?: Game[];
  showLiveScores?: boolean;
  onToggleLiveScores?: () => void;
  onSyncLiveScores?: () => void;
  isSyncingScores?: boolean;
  lastScoreSyncTime?: string;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
  liveGamesCount?: number;
  // Compact / Collapsible Layout Controls
  isCompactMode?: boolean;
  onToggleCompactMode?: () => void;
  isHeaderCollapsed?: boolean;
  onToggleHeaderCollapsed?: () => void;
}

export const AppNavigation: React.FC<NavigationProps> = memo(({
  currentTab,
  onSelectTab,
  activePlayer,
  allPlayers,
  onSelectPlayer,
  onOpenHelp,
  onOpenFineJar,
  onOpenSetupWizard,
  poolConfig,
  games = [],
  showLiveScores = false,
  onToggleLiveScores,
  onSyncLiveScores,
  isSyncingScores = false,
  lastScoreSyncTime,
  autoSyncEnabled = true,
  onToggleAutoSync,
  liveGamesCount = 0,
  isCompactMode = true,
  onToggleCompactMode,
  isHeaderCollapsed = false,
  onToggleHeaderCollapsed
}) => {
  const [isQuickToolsOpen, setIsQuickToolsOpen] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(isAdminPinUnlocked);
  const cfg = poolConfig || getSavedPoolConfig();

  useEffect(() => {
    const handleAuthChange = () => {
      setIsAdminUnlocked(isAdminPinUnlocked());
    };
    window.addEventListener('admin_auth_changed', handleAuthChange);
    return () => window.removeEventListener('admin_auth_changed', handleAuthChange);
  }, []);

  const tabs: { id: TabId; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { id: 'picks', label: 'Weekly Picks', shortLabel: 'Picks', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'leaderboard', label: 'Scoring Spreadsheet', shortLabel: 'Standings', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'consultant', label: 'Our 1986 Story & Fund', shortLabel: 'Our Story', icon: <ScrollText className="w-4 h-4" /> },
    { id: 'wire', label: 'Weekly Dispatches', shortLabel: 'Dispatches', icon: <Newspaper className="w-4 h-4" /> },
    { id: 'locker', label: 'Locker Room', shortLabel: 'Chat', icon: <MessageSquare className="w-4 h-4" /> },
    { 
      id: 'admin', 
      label: 'Admin Hub', 
      shortLabel: 'Admin', 
      icon: isAdminUnlocked ? <ShieldCheck className="w-4 h-4" /> : <Lock className="w-4 h-4" /> 
    }
  ];

  return (
    <>
      <header className="bg-[#1b3a2b] text-white sticky top-0 z-40 shadow-md transition-all duration-200">
        {/* ULTRA-COMPACT SLIM HEADER (When Header is Collapsed or in Compact Mode on Mobile) */}
        {isHeaderCollapsed ? (
          <div className="max-w-7xl mx-auto px-3 py-1.5 flex items-center justify-between gap-2 border-b border-emerald-800/80 bg-[#142d21]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base select-none">⚾</span>
              <span className="font-black text-xs sm:text-sm text-white tracking-tight truncate">
                {cfg.leagueName || 'Umpire Pool'}
              </span>
              {activePlayer && (
                <div className="h-8 flex items-center gap-1 bg-[#142d21] border border-emerald-700/70 rounded-lg px-2 py-0.5 text-[11px] truncate">
                  <span className="text-emerald-300 text-[10px]">Contender:</span>
                  <span className="font-bold text-white truncate max-w-[80px] sm:max-w-none">
                    {activePlayer.name}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Quick Tools Sheet Trigger */}
              <button
                id="collapsed-quick-tools-btn"
                onClick={() => setIsQuickToolsOpen(true)}
                className={`h-8 px-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border shadow-2xs transition-all cursor-pointer ${
                  isQuickToolsOpen
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black border-amber-300 shadow-xs'
                    : 'bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70'
                }`}
                title="Quick Tools & Scoreboard"
              >
                <Sliders className={`w-3.5 h-3.5 ${isQuickToolsOpen ? 'text-slate-950' : 'text-emerald-300'}`} />
                <span>Tools</span>
              </button>

              {/* Expand Header Button */}
              {onToggleHeaderCollapsed && (
                <button
                  onClick={onToggleHeaderCollapsed}
                  className="h-8 px-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 border shadow-2xs transition-all cursor-pointer bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70"
                  title="Expand full header banner"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="hidden sm:inline">Expand Header</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* STANDARD / EXPANDED HEADER BANNER */
          <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-800/60">
            {/* Brand & Association Subtitle */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-700/80 flex items-center justify-center text-base sm:text-xl shadow-inner shrink-0">
                ⚾
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-extrabold text-sm sm:text-lg tracking-tight leading-none text-white">
                    {cfg.leagueName || 'Umpire Gear NFL Pool'}
                  </h1>
                </div>
                <p className="text-[10px] sm:text-xs text-emerald-200/90 leading-tight mt-0.5">
                  {cfg.associationName || 'Umpire Equipment Fundraiser'} • ${cfg.buyInAmount || 20} Straight-Up
                </p>
              </div>
            </div>

            {/* Right Controls: Streamlined Controls & Layout Toggles */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {/* Compact Mode Toggle */}
              {onToggleCompactMode && (
                <button
                  id="header-toggle-compact-btn"
                  onClick={onToggleCompactMode}
                  className={`h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap ${
                    isCompactMode
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black border-amber-300 shadow-xs'
                      : 'bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70'
                  }`}
                  title={isCompactMode ? 'Compact Layout Active (Click for Standard)' : 'Standard Layout (Click for Compact Mobile View)'}
                >
                  <Smartphone className={`w-3.5 h-3.5 ${isCompactMode ? 'text-slate-950' : 'text-emerald-300'}`} />
                  <span className="hidden sm:inline">{isCompactMode ? 'Compact: ON' : 'Compact: OFF'}</span>
                  <span className="sm:hidden">{isCompactMode ? 'Compact' : 'Standard'}</span>
                </button>
              )}

              {/* Collapse Header Chevron Button */}
              {onToggleHeaderCollapsed && (
                <button
                  id="header-collapse-toggle-btn"
                  onClick={onToggleHeaderCollapsed}
                  className="h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70"
                  title="Collapse header to save vertical screen space on mobile"
                >
                  <ChevronUp className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="hidden md:inline">Slim Header</span>
                </button>
              )}

              {/* Live NFL Scoreboard Quick Toggle */}
              {onToggleLiveScores && (
                <button
                  id="header-toggle-scoreboard-btn"
                  onClick={onToggleLiveScores}
                  className={`h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap ${
                    showLiveScores
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black border-amber-300 shadow-xs'
                      : 'bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70'
                  }`}
                  title={showLiveScores ? 'Hide live NFL scoreboard ticker' : 'View live NFL scoreboard ticker'}
                >
                  <Radio className={`w-3.5 h-3.5 ${liveGamesCount > 0 ? 'text-rose-600 animate-pulse' : showLiveScores ? 'text-slate-950' : 'text-emerald-300'}`} />
                  <span className="hidden sm:inline">{showLiveScores ? 'Hide Scores' : 'Live Scores'}</span>
                  <span className="sm:hidden">Scores</span>
                  {liveGamesCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  )}
                </button>
              )}

              {/* Sync Live Scores (Desktop or Quick Tool) */}
              {onSyncLiveScores && (
                <button
                  id="header-sync-scores-btn"
                  onClick={onSyncLiveScores}
                  disabled={isSyncingScores}
                  className={`hidden sm:inline-flex h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap disabled:opacity-60 ${
                    isSyncingScores
                      ? 'bg-amber-400 text-slate-950 font-black border-amber-300 shadow-xs'
                      : 'bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70'
                  }`}
                  title="Fetch latest scores live directly from NFL/ESPN"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingScores ? 'animate-spin text-slate-950' : 'text-emerald-300'}`} />
                  <span>{isSyncingScores ? 'Syncing...' : 'Sync Scores'}</span>
                </button>
              )}

              {/* Player Identity Badge / Switcher */}
              {activePlayer ? (
                <div className="h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1 sm:gap-1.5 bg-[#142d21] text-emerald-100 border border-emerald-700/70 shadow-2xs">
                  <span className="text-emerald-300 font-medium text-[10px] sm:text-xs">Player:</span>
                  <span className="font-bold text-white flex items-center gap-0.5 text-[11px] sm:text-xs truncate max-w-[80px] sm:max-w-[120px]">
                    {activePlayer.name}
                  </span>
                  <button 
                    onClick={() => onSelectPlayer(null)}
                    className="text-[10px] sm:text-[11px] text-amber-300 hover:text-amber-200 underline cursor-pointer ml-0.5 font-semibold"
                    title="Switch contender"
                  >
                    (Switch)
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onSelectTab('picks')}
                  className="h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border border-emerald-700/70 shadow-2xs transition-all cursor-pointer active:scale-95"
                >
                  <User className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Choose Name</span>
                </button>
              )}

              {/* Mobile Quick Tools Drawer Button */}
              <button
                id="header-open-tools-btn"
                onClick={() => setIsQuickToolsOpen(true)}
                className={`flex sm:hidden h-8 px-2.5 rounded-lg text-xs font-bold items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-2xs active:scale-95 ${
                  isQuickToolsOpen
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black border-amber-300 shadow-xs'
                    : 'bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70'
                }`}
                title="Open quick actions & tools"
              >
                <Sliders className={`w-3.5 h-3.5 ${isQuickToolsOpen ? 'text-slate-950' : 'text-emerald-300'}`} />
                <span>Tools</span>
              </button>

              {/* $1 Fine Jar (Desktop/Tablet) */}
              {onOpenFineJar && cfg.enableFineJar !== false && (
                <button
                  onClick={onOpenFineJar}
                  className="hidden sm:inline-flex h-8 px-2.5 sm:px-3 rounded-lg text-xs font-black items-center justify-center gap-1.5 border border-amber-300 bg-amber-400 hover:bg-amber-300 text-slate-950 transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0 whitespace-nowrap"
                  title="Umpire Equipment Fine Jar"
                >
                  <span>$1 Fine Jar</span>
                </button>
              )}

              {/* Setup Wizard Button (Desktop/Tablet) */}
              {onOpenSetupWizard && (
                <button
                  onClick={onOpenSetupWizard}
                  className="hidden sm:inline-flex h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap bg-[#142d21] hover:bg-[#1a382a] text-amber-300 hover:text-amber-200 border-emerald-700/70"
                  title="Pool Setup Wizard & Settings"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-300" />
                  <span>Pool Setup</span>
                </button>
              )}

              {/* Help Modal (Desktop/Tablet) */}
              <button
                onClick={onOpenHelp}
                className="hidden sm:inline-flex h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold items-center justify-center gap-1.5 border transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70"
                title="Help, phone home screen setup & rules"
              >
                <HelpCircle className="w-3.5 h-3.5 text-emerald-300" />
                <span className="hidden md:inline">Help</span>
              </button>
            </div>
          </div>
        )}

        {/* Top Scrollable Tabs Navigation Bar */}
        <nav className="max-w-7xl mx-auto px-2 sm:px-6 flex overflow-x-auto no-scrollbar scroll-smooth py-1.5">
          <div className="flex items-center gap-1.5 min-w-full sm:min-w-0">
            {tabs.map(tab => {
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-btn-${tab.id}`}
                  onClick={() => onSelectTab(tab.id)}
                  className={`h-9 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 sm:gap-2 border transition-all whitespace-nowrap cursor-pointer shadow-2xs active:scale-95 ${
                    isActive
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black border-amber-300 shadow-xs'
                      : 'bg-[#142d21] hover:bg-[#1a382a] text-emerald-100 hover:text-white border-emerald-700/70'
                  }`}
                >
                  <span className={isActive ? 'text-slate-950' : 'text-emerald-300'}>
                    {tab.icon}
                  </span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  {tab.id === 'admin' && (
                    <span className={`ml-1 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-black ${
                      isActive
                        ? 'bg-slate-950 text-amber-300'
                        : isAdminUnlocked 
                          ? 'bg-emerald-800 text-emerald-200' 
                          : 'bg-amber-400 text-slate-950'
                    }`}>
                      {isAdminUnlocked ? (cfg.adminName || 'Admin') : 'PIN'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Live NFL Scoreboard directly attached beneath the title banner & visible on all tab views when toggled */}
        {showLiveScores && games && games.length > 0 && (
          <div id="global-live-scoreboard-container" className="bg-[#0b1710] border-t border-b border-emerald-900/80 shadow-md">
            <div className="max-w-7xl mx-auto px-2 sm:px-6 py-2">
              <LiveScoreboardTicker
                games={games}
                variant="banner"
                onSyncLiveScores={onSyncLiveScores}
                isSyncingScores={isSyncingScores}
                lastScoreSyncTime={lastScoreSyncTime}
                autoSyncEnabled={autoSyncEnabled}
                onToggleAutoSync={onToggleAutoSync}
              />
            </div>
          </div>
        )}
      </header>

      {/* MOBILE QUICK TOOLS BOTTOM SHEET / MODAL */}
      {isQuickToolsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div 
            className="bg-white text-slate-900 w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-200 animate-in slide-in-from-bottom-4 duration-200 max-h-[85vh] overflow-y-auto"
            style={{ touchAction: 'pan-y' }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-800" />
                <h3 className="font-extrabold text-base text-slate-900">
                  Quick Mobile Tools & Options
                </h3>
              </div>
              <button
                onClick={() => setIsQuickToolsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Grid */}
            <div className="space-y-2.5">
              {/* Layout Mode Switcher */}
              {onToggleCompactMode && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-700" />
                      <span>Display Layout Style</span>
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      {isCompactMode ? 'Compact / High Density (Fits more on screen)' : 'Standard Cards (Spacious)'}
                    </div>
                  </div>
                  <button
                    onClick={onToggleCompactMode}
                    className="px-3 py-1.5 rounded-lg bg-emerald-800 text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    {isCompactMode ? 'Switch to Standard' : 'Switch to Compact'}
                  </button>
                </div>
              )}

              {/* Collapse Header Switcher */}
              {onToggleHeaderCollapsed && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Maximize2 className="w-4 h-4 text-slate-700" />
                      <span>Header Title Bar</span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {isHeaderCollapsed ? 'Collapsed to slim 1-line' : 'Fully expanded'}
                    </div>
                  </div>
                  <button
                    onClick={onToggleHeaderCollapsed}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    {isHeaderCollapsed ? 'Expand Header' : 'Slim Header'}
                  </button>
                </div>
              )}

              {/* Live Scores Controls */}
              {onToggleLiveScores && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-amber-700" />
                      <span>Live NFL Scoreboard Ticker</span>
                    </div>
                    <div className="text-[11px] text-amber-800">
                      {showLiveScores ? 'Visible on top of screen' : 'Hidden for more screen space'}
                    </div>
                  </div>
                  <button
                    onClick={onToggleLiveScores}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer shadow-xs ${
                      showLiveScores ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 text-slate-800'
                    }`}
                  >
                    {showLiveScores ? 'Hide Scores' : 'Show Scores'}
                  </button>
                </div>
              )}

              {/* Sync Live Scores Button */}
              {onSyncLiveScores && (
                <button
                  onClick={() => {
                    onSyncLiveScores();
                    setIsQuickToolsOpen(false);
                  }}
                  disabled={isSyncingScores}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer hover:bg-emerald-600 disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 text-amber-300 ${isSyncingScores ? 'animate-spin' : ''}`} />
                    <span>Sync Live NFL Scores From ESPN</span>
                  </span>
                  <span className="text-[10px] text-emerald-200">{lastScoreSyncTime || 'Now'}</span>
                </button>
              )}

              {/* $1 Fine Jar */}
              {onOpenFineJar && (
                <button
                  onClick={() => {
                    setIsQuickToolsOpen(false);
                    onOpenFineJar();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs border border-amber-300 cursor-pointer shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-slate-950" />
                    <span>$1 Umpire Fine Jar</span>
                  </span>
                  <span className="text-[10px] bg-slate-950 text-amber-300 px-2 py-0.5 rounded font-bold">Open Jar</span>
                </button>
              )}

              {/* Help & Home Screen Modal */}
              <button
                onClick={() => {
                  setIsQuickToolsOpen(false);
                  onOpenHelp();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-200 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-emerald-700" />
                  <span>Rules & Add to Phone Home Screen</span>
                </span>
                <span className="text-slate-400">→</span>
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-center">
              <button
                onClick={() => setIsQuickToolsOpen(false)}
                className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close Options
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE STICKY BOTTOM NAVIGATION DOCK (Thumb-Friendly Tab Bar for Phone Users) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#1b3a2b] border-t border-emerald-800/90 shadow-2xl safe-area-pb">
        <div className="grid grid-cols-6 h-14">
          {tabs.map(tab => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`mobile-dock-tab-${tab.id}`}
                onClick={() => {
                  onSelectTab(tab.id);
                  try {
                    if (typeof navigator !== 'undefined' && navigator.vibrate) {
                      navigator.vibrate(10);
                    }
                  } catch (e) {}
                }}
                className={`flex flex-col items-center justify-center gap-0.5 relative py-1 text-center transition-all cursor-pointer ${
                  isActive 
                    ? 'text-amber-300 font-black' 
                    : 'text-emerald-200/70 hover:text-white font-medium'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-2 right-2 h-0.5 bg-amber-400 rounded-full" />
                )}
                <div className={`p-1 rounded-md ${isActive ? 'bg-emerald-850 text-amber-300 scale-110' : ''}`}>
                  {tab.icon}
                </div>
                <span className="text-[10px] leading-none tracking-tight">
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
});

export const Navigation = AppNavigation;

