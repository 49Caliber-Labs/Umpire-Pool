import React, { memo } from 'react';
import { 
  Award, 
  Scale, 
  Smile, 
  Heart,
  DollarSign,
  Sliders
} from 'lucide-react';
import { ElvisBadge } from './ElvisBadge';
import { PoolSetupConfig, getSavedPoolConfig } from '../config/leagueConfig';
import { Player, FineItem } from '../types';

interface ConsultantsCornerTabProps {
  poolConfig?: PoolSetupConfig;
  players?: Player[];
  fines?: FineItem[];
  onOpenSetupWizard?: () => void;
}

export const ConsultantsCornerTab: React.FC<ConsultantsCornerTabProps> = memo(({
  poolConfig,
  players = [],
  fines = [],
  onOpenSetupWizard
}) => {
  const cfg = poolConfig || getSavedPoolConfig();
  const activeHumanCount = players.filter(p => p.isActive !== false && !p.isElvis).length;
  const buyInRaised = activeHumanCount * (cfg.buyInAmount || 20);
  const fineJarRaised = fines.reduce((sum, f) => sum + (f.amount || 0), 0);
  const totalEquipmentFund = buyInRaised + fineJarRaised;

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      {/* Live Equipment Fundraiser Tracker Card */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-emerald-700/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-800">
            <DollarSign className="w-4 h-4 text-emerald-700" />
            <span>{cfg.associationName} • Equipment Fund Tracker</span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-slate-900">
            Goal: {cfg.equipmentGoalDescription}
          </h3>
          <p className="text-xs text-slate-600">
            100% of season buy-ins (${cfg.buyInAmount}/contender) and Fine Jar proceeds go directly to volunteer umpire protective gear.
          </p>
        </div>

        <div className="flex items-center gap-3 self-stretch sm:self-center justify-between sm:justify-end bg-emerald-950 text-white px-4 py-3 rounded-xl border border-emerald-700 shrink-0">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
              Total Gear Fund Raised
            </div>
            <div className="text-2xl font-mono font-black text-amber-300 tabular-nums">
              ${totalEquipmentFund}
            </div>
            <div className="text-[10px] text-emerald-200">
              {activeHumanCount} Contenders (${buyInRaised}) {fineJarRaised > 0 ? `+ $${fineJarRaised} Jar` : ''}
            </div>
          </div>
          {onOpenSetupWizard && (
            <button
              type="button"
              onClick={onOpenSetupWizard}
              className="px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 cursor-pointer"
              title="Open Pool Setup Wizard"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Setup</span>
            </button>
          )}
        </div>
      </div>

      {/* Hero Origin Story Card (Short Version) */}
      <div className="bg-gradient-to-br from-[#1b3a2b] to-[#142d21] text-white rounded-2xl p-6 sm:p-8 shadow-md border border-emerald-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-emerald-800/80">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-400 text-[#1b3a2b] flex items-center justify-center text-3xl sm:text-4xl font-extrabold shadow-inner shrink-0">
              ⚾
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30 mb-1">
                <Award className="w-3.5 h-3.5" />
                <span>Est. 1986 • A 40-Year Volunteer Tradition</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Why This Pool Exists: The 1986 Umpire Story
              </h2>
              <p className="text-emerald-200 text-sm font-medium">
                Founded in 1986 by Little League Volunteer Umpires
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right bg-emerald-900/60 p-3 rounded-xl border border-emerald-700/50 shrink-0">
            <div className="text-xs text-emerald-300 uppercase font-bold tracking-wider">
              Your Crew Leadership
            </div>
            <div className="text-sm font-bold text-white">{cfg.crewChiefName}: {cfg.crewChiefTitle}</div>
            <div className="text-xs text-emerald-200">{cfg.adminName}: Pool Admin</div>
          </div>
        </div>

        {/* Short 1986 Origin Story */}
        <div className="space-y-4 text-emerald-100/90 text-sm sm:text-base leading-relaxed font-normal">
          <p>
            Forty years ago in <strong>1986</strong>, a dedicated group of volunteer Little League parents and umpires faced a familiar problem in youth baseball: league budgets are tight, and volunteer umpires rarely get new or safe protective gear.
          </p>
          <p>
            To raise money for new umpire equipment—and keep the crew connected all autumn—the volunteers started a simple, friendly neighborhood NFL Pick&rsquo;em Pool. About <strong>20 friends, family members, and fellow volunteers chipped in $20 for the entire 18-week season</strong>. There were no point spreads, no gambling payouts, and no complicated math—just picking outright winners for weekly bragging rights, while <strong>100% of the $400 raised went straight toward buying new chest protectors, masks, and shin guards</strong> for the umpires.
          </p>

          <div className="p-4 bg-emerald-950/70 rounded-xl border border-emerald-700/40 text-sm mt-4">
            <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
              <Heart className="w-4 h-4 text-amber-400" />
              <span>Passing the Torch to Umpire Crews Everywhere</span>
            </div>
            <p className="text-xs sm:text-sm text-emerald-100 leading-relaxed">
              After four decades of running that pool by hand, this autonomous digital edition was built as a free template so volunteer umpire associations anywhere in the country can run their own self-driving equipment fundraiser with zero fees.
            </p>
          </div>
        </div>
      </div>

      {/* Official Pool Rules (The 1986 Code) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
          <Scale className="w-5 h-5 text-emerald-800" />
          <h3 className="text-lg font-bold text-slate-900">
            The Official Umpire Pool Rules
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <span>1. Straight-Up Winners Only (No Point Spreads)</span>
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every game, every week, you simply pick the team you think will win the game outright. You earn <strong>1 point</strong> for each winning pick and 0 points for a loss (or an NFL overtime tie). Vegas odds and team records are shown on the pick cards strictly to help you decide.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <span>2. Monday Night Tiebreaker (1st Place Weekly Ties Only)</span>
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              When submitting your picks, enter your guess for the combined total points scored by both teams in the Monday Night Football game. If two or more contenders tie for 1st place for the week, the contender closest to the actual MNF total wins the weekly crown. <strong>No extra point is added to your season score</strong>—you can only gain points by picking game winners.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <span>3. Individual Kickoff Lockout</span>
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Each game locks automatically at its scheduled kickoff time. If you miss Thursday Night Football, you can still make or change your Sunday and Monday picks right up until each game kicks off.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
              <span>4. ${cfg.buyInAmount} Season Fundraiser • Zero Gambling</span>
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              This is a community equipment fundraiser, not a betting pool. The ${cfg.buyInAmount} season contribution funds protective gear for local volunteer umpires, while contenders compete for weekly crowns and the season championship trophy.
            </p>
          </div>
        </div>
      </div>

      {/* The Tradition of Elvis (Vegas Favorites Bot) */}
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl p-6 border border-amber-200 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🕶️</span>
            <h3 className="text-lg font-bold text-amber-950">
              Why &ldquo;{cfg.elvisBotName || 'Elvis'}&rdquo; Is in the Pool (The Vegas Favorites Benchmark)
            </h3>
          </div>
          <ElvisBadge compact={true} />
        </div>
        <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed mb-3">
          In the original 1986 pool, a fellow volunteer umpire bought an extra $20 spot every single season for <strong>Elvis Presley</strong> to put an extra $20 into the umpire gear kitty.
        </p>
        <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
          To make sure Elvis had his own independent slate each week, <strong>{cfg.elvisBotName || 'Elvis'}</strong> automatically locks in the official Las Vegas favorites every week—serving as the pool&rsquo;s automated pacer to see which human contenders can out-pick Vegas!
        </p>
      </div>

      {/* Umpire Philosophies */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
          <Smile className="w-5 h-5 text-emerald-800" />
          <h3 className="text-lg font-bold text-slate-900">
            Diamond & Gridiron Umpire Wisdom
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 italic">
            &ldquo;My strike zone wasn&rsquo;t small—your swing was just late. Pick your games on time and don&rsquo;t ask for an extension after kickoff.&rdquo;
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 italic">
            &ldquo;If you want to argue a call, drop $1 in the Umpire Fine Jar first. The gear fund appreciates your passion.&rdquo;
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 italic">
            &ldquo;If you finish behind {cfg.elvisBotName || 'Elvis'} in the standings, you don&rsquo;t get to talk football at the ballpark until Thanksgiving.&rdquo;
          </div>
        </div>
      </div>
    </div>
  );
});
