import React, { memo } from 'react';
import { 
  X, 
  HelpCircle, 
  Smartphone, 
  CheckCircle2, 
  Clock, 
  PhoneCall, 
  Share2, 
  PlusSquare, 
  MoreVertical 
} from 'lucide-react';

import { getSavedPoolConfig } from '../config/leagueConfig';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = memo(({ isOpen, onClose }) => {
  if (!isOpen) return null;
  const poolConfig = getSavedPoolConfig();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200" style={{ contain: 'strict' }}>
      <div 
        className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] contain-modal"
        style={{ contain: 'layout paint' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="bg-[#1b3a2b] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-700/80 flex items-center justify-center text-xl font-bold">
              ❓
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold">Pool Help & Quick Guide</h3>
              <p className="text-xs text-emerald-200">Simple instructions for beginners & mobile setup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-emerald-800/80 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close help modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content (Scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-700 text-sm contain-content" style={{ contain: 'content' }}>
          
          {/* Section 1: How to Add to Phone Home Screen */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
            <h4 className="text-sm font-extrabold text-emerald-950 flex items-center gap-2 mb-2">
              <Smartphone className="w-4 h-4 text-emerald-700" />
              <span>How to Add This App to Your Phone Home Screen</span>
            </h4>
            <p className="text-xs text-slate-600 mb-3">
              You don&rsquo;t need the App Store or Google Play! You can put a direct 1-tap icon right on your phone:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* iPhone */}
              <div className="bg-white p-3 rounded-lg border border-emerald-200/80 shadow-2xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
                  <span>📱 Apple iPhone (Safari)</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                  <li>Open the pool link in <strong>Safari</strong>.</li>
                  <li>Tap the <strong>Share</strong> button at the bottom (box with arrow pointing up <Share2 className="w-3 h-3 inline text-slate-500" />).</li>
                  <li>Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> (<PlusSquare className="w-3 h-3 inline text-slate-500" />).</li>
                  <li>Tap <strong>Add</strong> in the top right. That&rsquo;s it!</li>
                </ol>
              </div>

              {/* Android */}
              <div className="bg-white p-3 rounded-lg border border-emerald-200/80 shadow-2xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1.5">
                  <span>🤖 Android (Chrome)</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                  <li>Open the pool link in <strong>Chrome</strong>.</li>
                  <li>Tap the <strong>three dots menu</strong> in the top right (<MoreVertical className="w-3 h-3 inline text-slate-500" />).</li>
                  <li>Tap <strong>&ldquo;Install App&rdquo;</strong> or <strong>&ldquo;Add to Home Screen&rdquo;</strong>.</li>
                  <li>Tap <strong>Install</strong> to confirm.</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Section 2: How to Make Your Weekly Picks */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>How to Make Your Picks Each Week</span>
            </h4>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-800 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <p>
                  <strong>Select Your Name</strong> from the dropdown menu at the top. There are no passwords or logins—your phone will automatically remember who you are.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-800 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <p>
                  <strong>Tap your winner</strong> for each game. The team you select will turn green with a checkmark.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-800 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </span>
                <p>
                  <strong>Enter your Monday Night tiebreaker score</strong> (predicted combined total points for both teams), then tap <strong>&ldquo;Submit & Lock In Picks&rdquo;</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Pool Rules & Kickoff Lockout */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4">
            <h4 className="text-sm font-extrabold text-amber-950 flex items-center gap-2 mb-1.5">
              <Clock className="w-4 h-4 text-amber-700" />
              <span>When Do Games Lock?</span>
            </h4>
            <p className="text-xs text-amber-900 leading-relaxed">
              Each individual game locks right when the game kicks off. You can change your picks for any upcoming Sunday game right up until kickoff whistle. Once a game starts, its pick is permanently locked.
            </p>
          </div>

          {/* Section 4: Need Help / Phone Assistance */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                <PhoneCall className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-xs text-slate-900">Need Help or Can&rsquo;t Reach a Phone?</div>
                <p className="text-[11px] text-slate-500">
                  Call or text {poolConfig.adminName} (Pool Admin) and they can record your picks for you in the Dugout.
                </p>
              </div>
            </div>
            <a
              href={`mailto:${poolConfig.adminEmail}`}
              className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors shrink-0"
            >
              Contact Admin
            </a>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto bg-[#1b3a2b] hover:bg-[#142d21] text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer transition-all"
          >
            Got It, Let&rsquo;s Play!
          </button>
        </div>
      </div>
    </div>
  );
});
