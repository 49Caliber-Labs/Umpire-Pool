import React, { useState, memo } from 'react';
import { X, DollarSign, Gavel, CheckCircle2, Plus, Sparkles, ShieldAlert, Heart } from 'lucide-react';
import { FineItem, Player } from '../types';

interface UmpireFineJarModalProps {
  isOpen: boolean;
  onClose: () => void;
  fines: FineItem[];
  players: Player[];
  onAddFine: (playerName: string, reason: string, amount?: number) => void;
  onTogglePaid: (id: string) => void;
}

const PRESET_INFRACTIONS = [
  "Questioning the strike zone in the Locker Room",
  "Asking for a point spread cushion in a straight-up pool",
  "Picking against the home team and losing by 14+",
  "Trailing Elvis (The King) in the weekly standings",
  "Filing a Monday morning protest after an overtime loss",
  "Claiming 'my dog ate my pick sheet' before Thursday Night Football"
];

export const UmpireFineJarModal: React.FC<UmpireFineJarModalProps> = memo(({
  isOpen,
  onClose,
  fines,
  players,
  onAddFine,
  onTogglePaid
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<string>(players[0]?.name || 'Pool Admin');
  const [customReason, setCustomReason] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  if (!isOpen) return null;

  const totalJarAmount = fines.reduce((sum, item) => sum + item.amount, 0);
  const collectedAmount = fines.filter(f => f.paid).reduce((sum, item) => sum + item.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customReason.trim()) return;
    onAddFine(selectedPlayer, customReason.trim(), 1);
    setCustomReason('');
    setShowAddForm(false);
  };

  const handlePresetSelect = (preset: string) => {
    setCustomReason(preset);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border-4 border-amber-400 shadow-2xl overflow-hidden">
        {/* Top Umpire Header */}
        <div className="bg-gradient-to-r from-[#132a1f] via-[#1b3a2b] to-[#0f2319] text-white p-5 sm:p-6 border-b-2 border-amber-400 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-400 text-[#132a1f] flex items-center justify-center shadow-md shrink-0 border-2 border-white/30">
              <Gavel className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider mb-1">
                <span>⚾ 1986 Umpire Gear Tradition</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                $1 Umpire Fine Jar
              </h2>
              <p className="text-xs text-emerald-200 font-medium">
                &ldquo;Arguing balls and strikes costs $1 for the Little League umpire gear fund!&rdquo;
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Jar Counter Banner */}
        <div className="bg-amber-50 px-5 py-3.5 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-amber-400 text-slate-950 font-black px-3 py-1.5 rounded-xl text-sm sm:text-base flex items-center gap-1 shadow-xs border border-amber-500">
              <DollarSign className="w-4 h-4" />
              <span>{totalJarAmount}.00 in Jar</span>
            </div>
            <div className="text-xs text-amber-950">
              <div className="font-extrabold flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-rose-600 fill-rose-600" />
                <span>100% Proceeds: Little League Umpire Protective Gear</span>
              </div>
              <div className="text-[11px] text-amber-800">
                ${collectedAmount}.00 collected • ${totalJarAmount - collectedAmount}.00 on the honor tab
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowAddForm(prev => !prev)}
            className="bg-[#1b3a2b] hover:bg-emerald-900 text-amber-300 font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs border border-emerald-700"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddForm ? 'Cancel Citation' : 'Toss $1 / Issue Citation'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Add Fine Form */}
          {showAddForm && (
            <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-2xl border-2 border-emerald-700/30 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Issue Official $1 Umpire Citation</span>
                </h4>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                  +$1.00 to Gear Fund
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Contender Cited:
                  </label>
                  <select
                    value={selectedPlayer}
                    onChange={(e) => setSelectedPlayer(e.target.value)}
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-700"
                  >
                    {players.map(p => (
                      <option key={p.id} value={p.name}>
                        {p.name} {p.isElvis ? '(The King)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Reason for Citation (or select preset below):
                  </label>
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="e.g. Complaining about Monday Night overtime..."
                    className="w-full bg-white border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              {/* Preset Quick Pills */}
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Tap a Classic Umpire Citation:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_INFRACTIONS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className="text-[11px] bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-950 border border-slate-200 hover:border-amber-300 px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-left"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={!customReason.trim()}
                  className="bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-black text-xs px-4 py-2 rounded-xl shadow-xs cursor-pointer transition-all"
                >
                  Drop $1 in the Umpire Jar
                </button>
              </div>
            </form>
          )}

          {/* Fines List */}
          <div className="space-y-2.5">
            {fines.map((fine) => (
              <div
                key={fine.id}
                className={`p-3.5 rounded-2xl border-2 transition-all flex items-center justify-between gap-3 ${
                  fine.paid
                    ? 'bg-emerald-50/50 border-emerald-200'
                    : 'bg-white border-amber-200 shadow-2xs'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border ${
                    fine.paid
                      ? 'bg-emerald-700 text-amber-300 border-emerald-800'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    ${fine.amount}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-slate-900">{fine.contenderName || fine.playerName}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        Cited by {fine.issuedBy}
                      </span>
                      <span className="text-[11px] text-slate-400">{fine.date || fine.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-700 mt-0.5 font-medium">
                      &ldquo;{fine.reason}&rdquo;
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onTogglePaid(fine.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all border ${
                    fine.paid
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                      : 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-amber-500 shadow-2xs'
                  }`}
                  title={fine.paid ? "Mark as unpaid" : "Mark $1 as paid into the jar"}
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 ${fine.paid ? 'text-emerald-700' : 'text-slate-950'}`} />
                  <span>{fine.paid ? 'In the Jar' : 'Mark Paid'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Note */}
        <div className="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
          <span>⚾ Umpire Equipment Fundraiser • 100% Volunteer Tradition</span>
          <button
            onClick={onClose}
            className="font-bold text-slate-800 hover:text-slate-950 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
});
