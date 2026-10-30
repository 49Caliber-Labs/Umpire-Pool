import React from 'react';
import { 
  ShieldCheck, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  FileText, 
  ListOrdered, 
  Flame 
} from 'lucide-react';
import { OperationalCheckResult } from '../services/operationalCheckService';

interface OperationalCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  isRunning: boolean;
  results: OperationalCheckResult[];
  onRerun?: () => void;
}

export const OperationalCheckModal: React.FC<OperationalCheckModalProps> = ({
  isOpen,
  onClose,
  isRunning,
  results,
  onRerun
}) => {
  if (!isOpen) return null;

  const passedCount = results.filter(r => r.status === 'passed').length;
  const warningCount = results.filter(r => r.status === 'warning').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const totalCount = results.length;
  const allPassed = passedCount === totalCount && totalCount > 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" 
      style={{ contain: 'strict' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden contain-modal" 
        style={{ contain: 'layout paint' }}
      >
        {/* Modal Header */}
        <div className="p-4 bg-[#1b3a2b] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800/80 flex items-center justify-center text-emerald-200">
              <ShieldCheck className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h4 className="font-black text-sm tracking-tight">
                Operational Checks & Verification Report
              </h4>
              <p className="text-[11px] text-emerald-200">
                Dispatches (Recaps, Standings, MNF Highlights), Tiebreaker Rules & Global Sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-emerald-200 hover:text-white p-1.5 rounded-lg hover:bg-emerald-800/50 transition-colors cursor-pointer text-sm font-bold"
            title="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-3.5 contain-content" style={{ contain: 'content' }}>
          {isRunning ? (
            <div className="py-14 flex flex-col items-center justify-center text-slate-500 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm font-bold text-slate-700">
                Running standardized operational verification checks...
              </p>
              <p className="text-xs text-slate-400">
                Auditing Sunday & Tuesday dispatches, mandatory fields, roster recipients, and global sync.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs">
              No checks run yet. Click "Run Checks" to verify.
            </div>
          ) : (
            results.map((check, idx) => (
              <div 
                key={idx} 
                className={`p-4 rounded-xl border transition-all ${
                  check.status === 'passed' 
                    ? 'border-emerald-200 bg-emerald-50/30' 
                    : check.status === 'warning'
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-rose-300 bg-rose-50/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {check.status === 'passed' && (
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    )}
                    {check.status === 'warning' && (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    {check.status === 'failed' && (
                      <XCircle className="w-5 h-5 text-rose-600" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                      <h5 className="font-black text-xs sm:text-sm text-slate-900">
                        {check.title}
                      </h5>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {check.category}
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          check.status === 'passed' 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          check.status === 'warning' 
                            ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                            'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {check.status}
                        </span>
                      </div>
                    </div>

                    {/* Mandatory Fields Visual Indicators for Dispatches */}
                    {check.mandatoryFields && (
                      <div className="my-2 p-2 bg-white rounded-lg border border-slate-200/90 flex flex-wrap items-center gap-3 text-[11px]">
                        <span className="font-bold text-slate-500 text-[10px] uppercase tracking-wider">
                          Mandatory Fields:
                        </span>

                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded ${
                          check.mandatoryFields.recaps 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}>
                          <FileText className="w-3 h-3" />
                          <span>Recaps: {check.mandatoryFields.recaps ? 'Populated ✓' : 'Missing ✗'}</span>
                        </span>

                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded ${
                          check.mandatoryFields.standings 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}>
                          <ListOrdered className="w-3 h-3" />
                          <span>Standings: {check.mandatoryFields.standings ? 'Populated ✓' : 'Missing ✗'}</span>
                        </span>

                        <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded ${
                          check.mandatoryFields.mnfHighlights 
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}>
                          <Flame className="w-3 h-3" />
                          <span>MNF Highlights: {check.mandatoryFields.mnfHighlights ? 'Populated ✓' : 'Missing ✗'}</span>
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {check.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold">
            {isRunning ? (
              <span className="text-slate-500">Checking criteria...</span>
            ) : allPassed ? (
              <span className="text-emerald-700 flex items-center gap-1.5 font-bold">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                All {totalCount} operational check criteria passed
              </span>
            ) : (
              <span className="text-slate-700">
                <strong className="text-emerald-700">{passedCount}</strong> of {totalCount} passed
                {failedCount > 0 && <span className="text-rose-600 font-bold ml-1.5">• {failedCount} failed</span>}
                {warningCount > 0 && <span className="text-amber-600 font-bold ml-1.5">• {warningCount} warnings</span>}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onRerun && (
              <button
                type="button"
                onClick={onRerun}
                disabled={isRunning}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                <span>Re-run Checks</span>
              </button>
            )}
            
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-[#1b3a2b] hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
