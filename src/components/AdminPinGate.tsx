import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Unlock, ShieldAlert, KeyRound, ArrowLeft, X, AlertCircle } from 'lucide-react';
import { verifyAdminPin, setAdminPinUnlocked } from '../utils/adminAuth';

interface AdminPinGateProps {
  onSuccess: () => void;
  onCancel?: () => void;
  isModal?: boolean;
  title?: string;
  description?: string;
}

export const AdminPinGate: React.FC<AdminPinGateProps> = ({
  onSuccess,
  onCancel,
  isModal = false,
  title = "Admin Hub Access Required",
  description = "Enter the 4-digit administrator PIN to access pool management, scoring overrides, and dispatch controls."
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Automatically focus on mount
    inputRef.current?.focus();
  }, []);

  const handleDigitInput = useCallback((digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(null);

    if (newPin.length === 4) {
      validatePin(newPin);
    }
  }, [pin]);

  const handleBackspace = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setPin('');
    setError(null);
    inputRef.current?.focus();
  }, []);

  const validatePin = (pinToValidate: string) => {
    if (verifyAdminPin(pinToValidate)) {
      setIsSuccess(true);
      setError(null);
      setAdminPinUnlocked(true);
      setTimeout(() => {
        onSuccess();
      }, 300);
    } else {
      setError('Incorrect PIN. Please try again.');
      setIsShaking(true);
      setTimeout(() => {
        setIsShaking(false);
        setPin('');
        inputRef.current?.focus();
      }, 600);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      handleDigitInput(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  const content = (
    <div 
      className={`w-full max-w-md mx-auto bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 text-white relative ${
        isShaking ? 'animate-bounce' : ''
      }`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Hidden real input for mobile keyboards */}
      <input
        ref={inputRef}
        type="password"
        pattern="[0-9]*"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => {
          const val = e.target.value.replace(/\D/g, '').slice(0, 4);
          setPin(val);
          setError(null);
          if (val.length === 4) {
            validatePin(val);
          }
        }}
        className="opacity-0 absolute inset-0 pointer-events-none w-0 h-0"
        aria-hidden="true"
      />

      {/* Close button if modal or onCancel provided */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Header Icon */}
      <div className="flex flex-col items-center text-center space-y-3 mb-6">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
          isSuccess 
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-lg shadow-emerald-500/20' 
            : error 
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' 
              : 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/50'
        }`}>
          {isSuccess ? (
            <Unlock className="w-8 h-8 animate-pulse" />
          ) : error ? (
            <ShieldAlert className="w-8 h-8" />
          ) : (
            <Lock className="w-8 h-8" />
          )}
        </div>

        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-100">
          {title}
        </h2>
        
        <p className="text-xs sm:text-sm text-slate-400 max-w-xs leading-relaxed">
          {description}
        </p>
      </div>

      {/* PIN Digit Indicators */}
      <div 
        onClick={() => inputRef.current?.focus()}
        className="flex justify-center items-center gap-3 sm:gap-4 my-6 cursor-pointer"
      >
        {[0, 1, 2, 3].map((idx) => {
          const isFilled = pin.length > idx;
          const isCurrent = pin.length === idx;
          return (
            <div
              key={idx}
              className={`w-12 h-14 sm:w-14 sm:h-16 rounded-xl flex items-center justify-center text-2xl font-black transition-all ${
                isSuccess
                  ? 'bg-emerald-900/60 border-2 border-emerald-400 text-emerald-300'
                  : error
                    ? 'bg-rose-950/60 border-2 border-rose-500 text-rose-300'
                    : isCurrent
                      ? 'bg-slate-800 border-2 border-emerald-400 text-white shadow-md shadow-emerald-500/20 ring-2 ring-emerald-400/30'
                      : isFilled
                        ? 'bg-slate-800/90 border border-slate-600 text-emerald-400'
                        : 'bg-slate-950/60 border border-slate-800 text-slate-600'
              }`}
            >
              {isFilled ? '●' : ''}
            </div>
          );
        })}
      </div>

      {/* Error / Status Message */}
      <div className="h-6 flex items-center justify-center mb-6">
        {error ? (
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-rose-400 font-semibold animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : isSuccess ? (
          <div className="flex items-center gap-1.5 text-xs sm:text-sm text-emerald-400 font-semibold">
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>PIN Accepted • Access Granted</span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-500">
            Tap on-screen numbers or type on keyboard
          </span>
        )}
      </div>

      {/* Numeric Keypad for Mobile & Touch */}
      <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto mb-6">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigitInput(digit)}
            disabled={isSuccess}
            className="h-12 sm:h-14 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 active:bg-emerald-700 border border-slate-700/70 text-lg sm:text-xl font-bold text-slate-100 active:scale-95 transition-all flex items-center justify-center select-none"
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          onClick={handleClear}
          disabled={isSuccess || pin.length === 0}
          className="h-12 sm:h-14 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 text-xs font-semibold text-slate-400 hover:text-slate-200 active:scale-95 transition-all flex items-center justify-center select-none disabled:opacity-30 disabled:pointer-events-none"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => handleDigitInput('0')}
          disabled={isSuccess}
          className="h-12 sm:h-14 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 active:bg-emerald-700 border border-slate-700/70 text-lg sm:text-xl font-bold text-slate-100 active:scale-95 transition-all flex items-center justify-center select-none"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          disabled={isSuccess || pin.length === 0}
          className="h-12 sm:h-14 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 text-xs font-semibold text-slate-400 hover:text-slate-200 active:scale-95 transition-all flex items-center justify-center select-none disabled:opacity-30 disabled:pointer-events-none"
        >
          ⌫
        </button>
      </div>

      {/* Return / Cancel button if onCancel passed */}
      {onCancel && (
        <div className="pt-2 border-t border-slate-800/80 text-center">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 font-medium py-1 px-3 rounded-md hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Pool</span>
          </button>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4 bg-slate-950/50">
      {content}
    </div>
  );
};
