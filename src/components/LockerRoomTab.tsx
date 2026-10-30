import React, { useState, useRef, useEffect, memo } from 'react';
import { MessageSquare, Send, User, Sparkles, Smile, Trash2, Radio, Trophy, DollarSign, ArrowDown, Zap } from 'lucide-react';
import { ChatMessage, Player, Game } from '../types';
import { LiveScoreboardTicker } from './LiveScoreboardTicker';
import { useSafeTimeout } from '../utils/performanceUtils';
import { getSavedPoolConfig } from '../config/leagueConfig';

interface LockerRoomTabProps {
  messages: ChatMessage[];
  activePlayer: Player | null;
  games: Game[];
  onSendMessage: (senderName: string, text: string, role?: 'admin' | 'consultant' | 'player' | 'legend') => void;
  onDeleteMessage?: (id: string) => void;
  onOpenFineJar?: () => void;
}

const ChatMessageItem: React.FC<{
  msg: ChatMessage;
  isLatest: boolean;
  justPosted: boolean;
  isConfirming: boolean;
  onDelete: (id: string) => void;
  onDeleteMessage?: (id: string) => void;
}> = memo(({ msg, isLatest, justPosted, isConfirming, onDelete, onDeleteMessage }) => {
  const poolConfig = getSavedPoolConfig();
  const isConsultant = msg.role === 'consultant' || msg.sender === 'Crew Chief' || msg.sender === poolConfig.crewChiefName;
  const isAdmin = msg.role === 'admin' || msg.sender === poolConfig.adminName || msg.sender === 'Pool Admin';

  return (
    <div 
      className={`group relative p-3.5 rounded-xl border-2 transition-all ${
        isConsultant 
          ? 'bg-emerald-50/80 border-emerald-300' 
          : isAdmin 
            ? 'bg-slate-50 border-slate-300' 
            : 'bg-white border-slate-200 hover:border-slate-300'
      } ${isLatest && justPosted ? 'ring-2 ring-emerald-400 ring-offset-1' : ''}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1">
            {msg.sender}
          </span>
          {isConsultant && (
            <span className="text-[10px] font-black bg-[#1b3a2b] text-white px-2 py-0.2 rounded-md">
              Crew Chief
            </span>
          )}
          {isAdmin && (
            <span className="text-[10px] font-black bg-slate-800 text-white px-2 py-0.2 rounded-md">
              Pool Admin
            </span>
          )}
          {isLatest && justPosted && (
            <span className="text-[9px] font-bold bg-emerald-600 text-white px-1.5 py-0.2 rounded-md animate-pulse">
              Just posted
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-slate-400 font-mono">
            {msg.timestamp}
          </span>

          {/* Discrete Message Delete Button */}
          {onDeleteMessage && (
            <button
              type="button"
              onClick={() => onDelete(msg.id)}
              className={`transition-all rounded-md px-1.5 py-0.5 text-xs flex items-center gap-1 cursor-pointer ${
                isConfirming
                  ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold opacity-100'
                  : 'text-slate-400 hover:text-rose-600 opacity-60 sm:opacity-0 group-hover:opacity-100 hover:bg-slate-100'
              }`}
              title="Discrete delete message"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isConfirming && <span className="text-[10px]">Confirm?</span>}
            </button>
          )}
        </div>
      </div>

      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-medium whitespace-pre-wrap">
        {msg.text}
      </p>
    </div>
  );
});

export const LockerRoomTab: React.FC<LockerRoomTabProps> = memo(({
  messages,
  activePlayer,
  games,
  onSendMessage,
  onDeleteMessage,
  onOpenFineJar
}) => {
  const { setSafeTimeout } = useSafeTimeout();
  const [newMsgText, setNewMsgText] = useState('');
  const [customSender, setCustomSender] = useState('');
  const [showScoreboard, setShowScoreboard] = useState<boolean>(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [justPosted, setJustPosted] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsgText.trim()) return;

    const sender = customSender.trim() || (activePlayer ? activePlayer.name : 'Contender');
    const role = activePlayer?.role || (sender.toLowerCase().includes('elvis') ? 'legend' : 'player');

    onSendMessage(sender, newMsgText.trim(), role);
    setNewMsgText('');
    setJustPosted(true);
    setSafeTimeout(() => setJustPosted(false), 2000);
    setSafeTimeout(() => scrollToBottom(true), 50);
  };

  const handleQuickSend = (text: string) => {
    const sender = customSender.trim() || (activePlayer ? activePlayer.name : 'Contender');
    const role = activePlayer?.role || 'player';
    onSendMessage(sender, text, role);
    setJustPosted(true);
    setSafeTimeout(() => setJustPosted(false), 2000);
    setSafeTimeout(() => scrollToBottom(true), 50);
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      onDeleteMessage?.(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setSafeTimeout(() => setConfirmDeleteId(null), 4000);
    }
  };

  const liveGameCount = games.filter(g => g.status === 'in_progress').length;

  const quickChips = [
    "🔥 Big Sunday win coming up!",
    "🔥 Picks are locked and loaded!",
    "💵 $1 fine for questionable officiating!",
    "👀 Check the Leaderboard matrix!",
    "🏈 Touchdown in the 4th quarter!"
  ];

  return (
    <div className="max-w-4xl mx-auto py-6 px-3 sm:px-4 space-y-4">
      {/* Top Banner with Umpire Jar & Scoreboard Toggle */}
      <div className="bg-[#12281d] text-white rounded-2xl p-5 border-2 border-[#1c402e] shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-700 border-2 border-emerald-400 flex items-center justify-center text-2xl shadow-md shrink-0">
            💬
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">The Locker Room</h2>
              <span className="bg-emerald-800 text-emerald-200 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-600">
                Live Chatter & Banter
              </span>
            </div>
            <p className="text-xs sm:text-sm text-emerald-200 mt-0.5 font-medium">
              Community trash talk, Sunday reactions, and umpire citations.
            </p>
          </div>
        </div>

        {/* Action Badges */}
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {onOpenFineJar && (
            <button
              onClick={onOpenFineJar}
              className="flex items-center justify-center bg-amber-400 hover:bg-amber-300 text-slate-950 px-2.5 py-1 rounded-lg border border-amber-300 text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 whitespace-nowrap"
              title="$1 Umpire Fine Jar (Pool Banter & Tradition)"
            >
              <span>$1 Fine Jar</span>
            </button>
          )}

          <button
            onClick={() => setShowScoreboard(prev => !prev)}
            className={`flex items-center gap-1.5 font-bold text-xs px-3 py-2 rounded-xl border-2 transition-all cursor-pointer ${
              showScoreboard
                ? 'bg-emerald-800 text-white border-emerald-500'
                : 'bg-black/30 text-emerald-200 border-emerald-900 hover:bg-black/50'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${liveGameCount > 0 ? 'text-amber-300 animate-pulse' : 'text-emerald-300'}`} />
            <span>{showScoreboard ? 'Hide Scores' : 'Show Live Scores'}</span>
          </button>
        </div>
      </div>

      {/* Embedded Real-Time Scoreboard Banner */}
      {showScoreboard && (
        <div className="space-y-1">
          <LiveScoreboardTicker games={games} variant="embedded" />
        </div>
      )}

      {/* Message Feed Card */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm p-4 sm:p-5 flex flex-col h-[560px] contain-modal" style={{ contain: 'layout paint' }}>
        {/* Feed Header */}
        <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-200 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              Live Feed Synced
            </span>
            <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">
              ({messages.length} messages posted)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors"
              title="Scroll to latest message"
            >
              <ArrowDown className="w-3 h-3" />
              <span>Jump to Bottom</span>
            </button>
          </div>
        </div>

        {/* Message Items Scroll Container */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scroll-smooth contain-content" style={{ contain: 'content' }}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-400">
              <MessageSquare className="w-10 h-10 text-slate-300 mb-2" />
              <p className="font-bold text-slate-600 text-sm">The Locker Room is Open</p>
              <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
                Live board synced for Week 3. Drop in pregame banter, smack talk, or cheer your straight-up picks below!
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <ChatMessageItem
                key={msg.id}
                msg={msg}
                isLatest={index === messages.length - 1}
                justPosted={justPosted}
                isConfirming={confirmDeleteId === msg.id}
                onDelete={handleDelete}
                onDeleteMessage={onDeleteMessage}
              />
            ))
          )}
          {/* Scroll target */}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Banter Chips */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <span className="text-[10px] font-bold text-slate-400 shrink-0 uppercase tracking-wide">
            Quick Banter:
          </span>
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleQuickSend(chip)}
              className="text-[11px] font-semibold bg-slate-100 hover:bg-emerald-100 hover:text-emerald-900 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200 hover:border-emerald-300 transition-colors whitespace-nowrap cursor-pointer shrink-0"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Poster Name & Message Input Bar */}
        <form onSubmit={handleSend} className="mt-2 pt-2 border-t-2 border-slate-200 flex flex-col sm:flex-row gap-2">
          {!activePlayer && (
            <input
              type="text"
              placeholder="Your Name"
              value={customSender}
              onChange={(e) => setCustomSender(e.target.value)}
              className="w-full sm:w-36 bg-slate-50 border-2 border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-700 focus:bg-white shrink-0"
            />
          )}

          <input
            type="text"
            placeholder={
              activePlayer 
                ? `Post a message live as ${activePlayer.name}...` 
                : "Post trash talk or cheer your picks..."
            }
            value={newMsgText}
            onChange={(e) => setNewMsgText(e.target.value)}
            className="flex-1 bg-slate-50 border-2 border-slate-300 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-700 focus:bg-white"
          />

          <button
            type="submit"
            className="bg-[#1b3a2b] hover:bg-emerald-950 text-white px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all shrink-0 active:scale-95 border-2 border-emerald-950"
          >
            <Send className="w-4 h-4 text-amber-300" />
            <span>Post Live</span>
          </button>
        </form>
      </div>
    </div>
  );
});
