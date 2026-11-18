import React, { memo } from 'react';
import { getSavedPoolConfig } from '../config/leagueConfig';

interface ElvisBadgeProps {
  showSubtitle?: boolean;
  compact?: boolean;
  botName?: string;
}

export const ElvisBadge: React.FC<ElvisBadgeProps> = memo(({ showSubtitle = true, compact = false, botName }) => {
  const resolvedBotName = (botName || getSavedPoolConfig().elvisBotName || 'Elvis').trim() || 'Elvis';

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
        <span>🕶️</span>
        <span>{resolvedBotName}</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 shadow-xs">
      <div className="w-7 h-7 rounded-full bg-amber-400/30 flex items-center justify-center text-base border border-amber-400">
        🕶️
      </div>
      <div>
        <div className="flex items-center gap-1.5 font-bold text-xs text-amber-950">
          <span>{resolvedBotName}</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-amber-200/80 rounded text-amber-900 font-medium">Honorary Member</span>
        </div>
        {showSubtitle && (
          <p className="text-[10px] text-amber-800">
            Vegas Favorites Pacer
          </p>
        )}
      </div>
    </div>
  );
});
