import React, { memo } from 'react';
import { 
  X, 
  Smartphone, 
  Monitor, 
  Tablet, 
  CheckCircle2, 
  Clock, 
  PhoneCall, 
  Share2, 
  PlusSquare, 
  MoreVertical,
  Printer,
  ShieldCheck,
  Coins,
  AlertTriangle,
  HelpCircle,
  FileSpreadsheet
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200" style={{ contain: 'strict' }}>
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] contain-modal"
        style={{ contain: 'layout paint' }}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="bg-[#1b3a2b] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-700/80 flex items-center justify-center text-xl font-bold shadow-inner">
              ⚾
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight leading-none">
                {poolConfig.leagueName || 'Umpire Pool'} • Help &amp; User Guide
              </h3>
              <p className="text-xs text-emerald-200/90 mt-1">
                Device setup, rules, app capabilities, &amp; troubleshooting
              </p>
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
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-slate-700 text-sm contain-content" style={{ contain: 'content' }}>
          
          {/* Section 1: Device Setup (Phones, iPads, PCs) */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-black text-emerald-950 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-700" />
              <span>How to Add to Home Screen (Phones, iPads &amp; PCs)</span>
            </h4>
            <p className="text-xs text-slate-600">
              No App Store or Google Play download required! Add a direct 1-tap launcher to any device:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* iPhone */}
              <div className="bg-white p-3 rounded-lg border border-emerald-200/80 shadow-2xs space-y-1.5">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-slate-700" />
                  <span>iPhone (Safari)</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                  <li>Open link in <strong>Safari</strong>.</li>
                  <li>Tap <strong>Share</strong> (<Share2 className="w-3 h-3 inline text-slate-500" />).</li>
                  <li>Tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> (<PlusSquare className="w-3 h-3 inline text-slate-500" />).</li>
                  <li>Tap <strong>Add</strong> in the top right.</li>
                </ol>
              </div>

              {/* iPad */}
              <div className="bg-white p-3 rounded-lg border border-emerald-200/80 shadow-2xs space-y-1.5">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Tablet className="w-3.5 h-3.5 text-slate-700" />
                  <span>iPad (Safari / Chrome)</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                  <li>Open pool in <strong>Safari</strong>.</li>
                  <li>Tap the <strong>Share</strong> icon near the address bar.</li>
                  <li>Select <strong>&ldquo;Add to Home Screen&rdquo;</strong>.</li>
                  <li>Supports landscape &amp; split-screen viewing!</li>
                </ol>
              </div>

              {/* Android & PC/Mac */}
              <div className="bg-white p-3 rounded-lg border border-emerald-200/80 shadow-2xs space-y-1.5">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5 text-slate-700" />
                  <span>Android, PC &amp; Mac</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                  <li>Open link in <strong>Chrome</strong> or <strong>Edge</strong>.</li>
                  <li>Tap the <strong>three dots</strong> menu (<MoreVertical className="w-3 h-3 inline text-slate-500" />).</li>
                  <li>Click <strong>&ldquo;Install App&rdquo;</strong> or bookmark (Ctrl+D / Cmd+D).</li>
                  <li>Launches like a native desktop app!</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Section 2: How to Make Your Weekly Picks */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>How Weekly Picks Work (Straight-Up Picks &amp; Lockout Rules)</span>
            </h4>
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-800 text-white font-black flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <p>
                  <strong>Select Your Name:</strong> Tap your name in the dropdown list. Your session will remember you. Contender identities are locked to prevent anyone from inputting picks on someone else&rsquo;s behalf.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-800 text-white font-black flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <p>
                  <strong>Straight-Up Winners:</strong> Pick the outright winner of each game. Point spreads are for information only—all standings count outright winners (1 pt per win).
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-800 text-white font-black flex items-center justify-center shrink-0 text-[11px]">
                  3
                </span>
                <p>
                  <strong>Monday Night Tiebreaker:</strong> Enter your predicted combined points for Monday Night Football (e.g. 45 pts). This number is strictly used to break ties for 1st place in the weekly race.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-800 text-white font-black flex items-center justify-center shrink-0 text-[11px]">
                  4
                </span>
                <p>
                  <strong>Individual Game Lockouts:</strong> Games lock individually at their scheduled kickoff whistle. Any upcoming Sunday or Monday game remains open and editable right up until that specific game kicks off!
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: App Features & Capabilities Overview */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Key App Features &amp; Capabilities</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-slate-700" />
                  <span>Print &amp; Blank Slips</span>
                </div>
                <p className="text-slate-600">
                  Head to <strong>Scoring Spreadsheet &rarr; Pick Sheets &amp; Printables</strong>. Choose between the live scoring matrix or a clean blank take-home slip. You can even print blank pick sheets for future upcoming weeks!
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Standings Vault &amp; Audit</span>
                </div>
                <p className="text-slate-600">
                  Past weeks are safely frozen in the Standings Vault. Admins can audit score drift, correct historical tallies, and record active week results into the season ledger.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-600" />
                  <span>$1 Umpire Fine Jar</span>
                </div>
                <p className="text-slate-600">
                  A fun, honorary tradition inspired by our 1986 roots. Toss in a dollar for bad picks or missed calls—100% of proceeds fund youth sports umpire gear and protective masks.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Official League Clock</span>
                </div>
                <p className="text-slate-600">
                  Monitors the live master time, official ESPN kickoff schedules, live game statuses, and automatic Tuesday morning winner certification.
                </p>
              </div>
            </div>
          </div>

          {/* Section 4: Troubleshooting & FAQs */}
          <div className="bg-amber-50/70 border border-amber-300 rounded-xl p-4 space-y-2.5">
            <h4 className="text-sm font-black text-amber-950 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>Troubleshooting &amp; Frequently Asked Questions</span>
            </h4>
            <div className="space-y-2 text-xs text-amber-950">
              <div>
                <p className="font-bold text-slate-900">Q: Can I change someone else&rsquo;s picks or switch contenders?</p>
                <p className="text-slate-700">
                  No. Contenders cannot input picks on behalf of others. Only the Pool Admin or an assigned Co-Admin can enter picks for other contenders using the <strong>Pick Overrider</strong> in the Admin Hub.
                </p>
              </div>

              <div>
                <p className="font-bold text-slate-900">Q: What if I accidentally selected the wrong name?</p>
                <p className="text-slate-700">
                  Ask your Pool Admin ({poolConfig.adminName}) to enter the 4-digit Admin PIN on your device, which unlocks contender switching immediately.
                </p>
              </div>

              <div>
                <p className="font-bold text-slate-900">Q: How do I print the spreadsheet without cutting off columns?</p>
                <p className="text-slate-700">
                  Click the <strong>&ldquo;Print Sheet&rdquo;</strong> button in the Vintage Matrix or Pick Sheets view. It automatically defaults to landscape Black &amp; White formatting and scales cleanly across standard 8.5&times;11 paper.
                </p>
              </div>

              <div>
                <p className="font-bold text-slate-900">Q: Scores seem behind during Sunday games—how do I refresh?</p>
                <p className="text-slate-700">
                  Tap <strong>&ldquo;Sync Scores&rdquo;</strong> in the top header or Tools drawer. The app fetches live official score updates directly from ESPN.
                </p>
              </div>
            </div>
          </div>

          {/* Section 5: Need Help / Phone Assistance */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
                <PhoneCall className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-xs text-slate-900">Need Help or Phone Assistance?</div>
                <p className="text-[11px] text-slate-500">
                  Contact Pool Admin <strong>{poolConfig.adminName}</strong> to record your picks or adjust your roster entry.
                </p>
              </div>
            </div>
            {poolConfig.adminEmail && (
              <a
                href={`mailto:${poolConfig.adminEmail}`}
                className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors shrink-0"
              >
                Contact Admin
              </a>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto bg-[#1b3a2b] hover:bg-[#142d21] text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer transition-all shadow-xs"
          >
            Close Guide &amp; Return to Pool
          </button>
        </div>
      </div>
    </div>
  );
});
