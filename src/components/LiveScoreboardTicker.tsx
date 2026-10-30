import React, { useState, memo } from 'react';
import { Trophy, ChevronLeft, ChevronRight, RefreshCw, Radio, Maximize2, Minimize2, Flame, Zap } from 'lucide-react';
import { Game } from '../types';
import { isGameTie } from '../utils/nflTieEngine';

interface LiveScoreboardTickerProps {
  games: Game[];
  variant?: 'banner' | 'embedded' | 'compact';
  onGameClick?: (game: Game) => void;
  onSyncLiveScores?: () => void;
  isSyncingScores?: boolean;
  lastScoreSyncTime?: string;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
  onSimulateStep?: () => void;
}

export const LiveScoreboardTicker: React.FC<LiveScoreboardTickerProps> = memo(({
  games,
  variant = 'banner',
  onGameClick,
  onSyncLiveScores,
  isSyncingScores = false,
  lastScoreSyncTime,
  autoSyncEnabled = true,
  onToggleAutoSync,
  onSimulateStep
}) => {
  const [filter, setFilter] = useState<'all' | 'live_final' | 'live'>('all');
  const [isExpanded, setIsExpanded] = useState<boolean>(variant !== 'compact');

  const filteredGames = games.filter(g => {
    if (filter === 'live') return g.status === 'in_progress';
    if (filter === 'live_final') return g.status === 'in_progress' || g.status === 'final';
    return true;
  });

  const liveCount = games.filter(g => g.status === 'in_progress').length;
  const finalCount = games.filter(g => g.status === 'final').length;

  return (
    <div className={`rounded-2xl border-2 transition-all ${
      variant === 'embedded'
        ? 'bg-slate-900 border-slate-700 text-white p-3.5 shadow-md'
        : 'bg-[#112218] border-[#1d432f] text-white p-3 shadow-lg'
    }`}>
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-emerald-900/60">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-emerald-800/80 px-2.5 py-1 rounded-lg border border-emerald-600/60 text-xs font-black">
            <Radio className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
            <span className="text-emerald-100 uppercase tracking-wider">NFL Live Scoreboard</span>
          </div>

          {liveCount > 0 ? (
            <span className="bg-amber-500 text-slate-950 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse shadow-xs">
              <span className="w-2 h-2 rounded-full bg-slate-950"></span>
              {liveCount} LIVE GAME{liveCount > 1 ? 'S' : ''} SYNCING
            </span>
          ) : (
            <span className="bg-emerald-900/90 text-emerald-200 text-[11px] font-bold px-2 py-0.5 rounded-full">
              {finalCount} Final • {games.length - finalCount} Scheduled
            </span>
          )}

          {lastScoreSyncTime && (
            <span className="text-[10px] text-emerald-300/80 hidden sm:inline">
              Synced: {lastScoreSyncTime}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {/* Quick Filters */}
          <div className="flex items-center bg-black/30 p-0.5 rounded-lg border border-emerald-800/40">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                filter === 'all' ? 'bg-emerald-700 text-white' : 'text-emerald-300 hover:text-white'
              }`}
            >
              All ({games.length})
            </button>
            <button
              onClick={() => setFilter('live_final')}
              className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                filter === 'live_final' ? 'bg-emerald-700 text-white' : 'text-emerald-300 hover:text-white'
              }`}
            >
              Active ({liveCount + finalCount})
            </button>
            {liveCount > 0 && (
              <button
                onClick={() => setFilter('live')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  filter === 'live' ? 'bg-amber-600 text-white' : 'text-amber-300 hover:text-white'
                }`}
              >
                Live ({liveCount})
              </button>
            )}
          </div>

          <button
            onClick={() => setIsExpanded(prev => !prev)}
            className="text-emerald-300 hover:text-white p-1 rounded-md hover:bg-emerald-800/50 cursor-pointer"
            title={isExpanded ? "Collapse scores" : "Expand scores"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Scoreboard Cards Slider / Grid */}
      {isExpanded && (
        <div className="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin scrollbar-thumb-emerald-700 scrollbar-track-emerald-950/40 contain-content" style={{ contain: 'content' }}>
          {filteredGames.map(game => {
            const isFinal = game.status === 'final';
            const isLive = game.status === 'in_progress';
            const awayScore = game.awayScore !== undefined ? game.awayScore : 0;
            const homeScore = game.homeScore !== undefined ? game.homeScore : 0;
            
            const awayLeading = isLive && awayScore > homeScore;
            const homeLeading = isLive && homeScore > awayScore;
            const isTied = isLive && awayScore === homeScore;

            const awayWon = isFinal && game.officialWinner === game.awayTeam;
            const homeWon = isFinal && game.officialWinner === game.homeTeam;

            return (
              <div
                key={game.gameNumber}
                onClick={() => onGameClick?.(game)}
                className={`shrink-0 w-44 sm:w-52 p-2.5 rounded-xl border-2 transition-all cursor-pointer select-none ${
                  isFinal
                    ? 'bg-slate-950/85 border-slate-700 hover:border-emerald-500'
                    : isLive
                      ? 'bg-amber-950/50 border-amber-500 hover:border-amber-400 ring-2 ring-amber-500/40 shadow-sm'
                      : 'bg-black/40 border-slate-800 hover:border-slate-600'
                }`}
              >
                {/* Card Header: Game # + Live Clock Status */}
                <div className="flex items-center justify-between text-[11px] pb-1.5 mb-1.5 border-b border-white/10">
                  <span className="font-mono font-black text-emerald-300">
                    G{game.gameNumber} • {game.day.split(' ')[0]}
                  </span>
                  <div>
                    {isFinal ? (
                      <span className="font-black text-emerald-400 text-[10px] bg-emerald-950/90 border border-emerald-700/50 px-1.5 py-0.5 rounded">
                        FINAL
                      </span>
                    ) : isLive ? (
                      <div className="flex items-center gap-1">
                        {game.redzone && (
                          <span className="text-[9px] font-black bg-rose-600 text-white px-1 py-0.2 rounded animate-pulse">
                            RZ
                          </span>
                        )}
                        <span className="font-black text-amber-300 text-[10px] bg-amber-950/90 border border-amber-500 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse">
                          <Flame className="w-2.5 h-2.5 text-amber-400" />
                          <span>{game.quarter || '4Q'} {game.clock || 'LIVE'}</span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[10px] font-medium" style={{ fontSize: '10px' }}>
                        {game.spread ? `${game.spread} • ` : ''}{game.kickoffTime}
                      </span>
                    )}
                  </div>
                </div>

                {/* Away Team Row */}
                <div className={`flex items-center justify-between py-1 px-1.5 rounded-md ${
                  awayWon 
                    ? 'bg-emerald-900/80 font-black text-white' 
                    : awayLeading 
                      ? 'bg-amber-900/60 font-black text-white ring-1 ring-amber-400/50' 
                      : 'text-slate-200'
                }`}>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`w-1.5 h-1.5 rounded-full ${awayWon ? 'bg-amber-400' : awayLeading ? 'bg-amber-400 animate-ping' : 'bg-slate-500'}`} />
                    <span className="text-xs font-bold truncate">{game.awayTeam}</span>
                    {awayLeading && <span className="text-[9px] font-black text-amber-300 uppercase">▲ Lead</span>}
                  </div>
                  <span className={`text-xs font-mono font-black ${
                    awayWon || awayLeading ? 'text-amber-300' : 'text-slate-300'
                  }`}>
                    {game.awayScore !== undefined ? game.awayScore : '—'}
                  </span>
                </div>

                {/* Home Team Row */}
                <div className={`flex items-center justify-between py-1 px-1.5 rounded-md mt-1 ${
                  homeWon 
                    ? 'bg-emerald-900/80 font-black text-white' 
                    : homeLeading 
                      ? 'bg-amber-900/60 font-black text-white ring-1 ring-amber-400/50' 
                      : 'text-slate-200'
                }`}>
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`w-1.5 h-1.5 rounded-full ${homeWon ? 'bg-amber-400' : homeLeading ? 'bg-amber-400 animate-ping' : 'bg-slate-500'}`} />
                    <span className="text-xs font-bold truncate">{game.homeTeam}</span>
                    {homeLeading && <span className="text-[9px] font-black text-amber-300 uppercase">▲ Lead</span>}
                  </div>
                  <span className={`text-xs font-mono font-black ${
                    homeWon || homeLeading ? 'text-amber-300' : 'text-slate-300'
                  }`}>
                    {game.homeScore !== undefined ? game.homeScore : '—'}
                  </span>
                </div>

                {/* Footer Info (Spread, Winner, or Live Situation) */}
                <div className="mt-1.5 pt-1 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                  {isLive ? (
                    <span className="text-amber-300 font-bold truncate">
                      {game.downDistance || (isTied ? 'Tied Game' : `${awayLeading ? game.awayTeam : game.homeTeam} leads`)}
                    </span>
                  ) : isGameTie(game) ? (
                    <span className="text-sky-300 font-bold">⚖️ Final (Tie)</span>
                  ) : game.officialWinner ? (
                    <span className="text-amber-400 font-bold">✓ {game.officialWinner}</span>
                  ) : (
                    <span>{game.spread}</span>
                  )}

                  <span className="text-slate-500">
                    {isFinal ? 'Final' : isLive ? 'Live' : `O/U ${game.overUnder}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

