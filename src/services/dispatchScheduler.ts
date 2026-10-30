import { Game, Player, PlayerPickData } from '../types';
import { createGmailDraft, sendGmailMessage, generateDispatchPayload, getCachedAccessToken } from './gmailService';

export interface DispatchScheduleItem {
  id: string;
  type: 'friday' | 'sunday' | 'tuesday';
  title: string;
  cadence: string;
  scheduledTime: string;
  description: string;
  status: 'drafted' | 'pending' | 'scheduled' | 'ready';
  lastDraftedAt?: string;
  draftId?: string;
  draftUrl?: string;
}

const STORAGE_KEY = 'nfl_pool_dispatch_scheduler_state_v1';

export interface SchedulerState {
  autoDraftEnabled: boolean;
  draftRecords: Record<string, {
    draftId: string;
    draftedAt: string;
    draftUrl: string;
    subject: string;
  }>;
  sentRecords?: Record<string, {
    messageId: string;
    sentAt: string;
    subject: string;
  }>;
}

export const SCHEDULE_DEFINITIONS: Omit<DispatchScheduleItem, 'status'>[] = [
  {
    id: 'dispatch-friday',
    type: 'friday',
    title: '🏈 Friday Night Wire & Injury Dossier',
    cadence: 'Every Friday',
    scheduledTime: '6:00 PM PST',
    description: 'Weekend kickoff notices, injury flags, straight-up lock reminders, and active roster checklist.'
  },
  {
    id: 'dispatch-sunday',
    type: 'sunday',
    title: '📊 Sunday Night Roast & Standings',
    cadence: 'Every Sunday Night',
    scheduledTime: '11:15 PM PST',
    description: 'Current pool standings entering Monday Night Football, 2-paragraph Crew Chief recap, leaders & losers roast, and tiebreaker stakes.'
  },
  {
    id: 'dispatch-tuesday',
    type: 'tuesday',
    title: '🏆 Tuesday Morning Crown & Final Standings',
    cadence: 'Every Tuesday Morning',
    scheduledTime: '7:30 AM PST',
    description: 'Official weekly champion crowned, final points ledger, friendly cellar banter, and blank Week 2 sheet drop.'
  }
];

export function getSchedulerState(): SchedulerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    autoDraftEnabled: true,
    draftRecords: {}
  };
}

export function saveSchedulerState(state: SchedulerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

export function setAutoDraftEnabled(enabled: boolean): SchedulerState {
  const current = getSchedulerState();
  current.autoDraftEnabled = enabled;
  saveSchedulerState(current);
  return current;
}

export function recordDraftSuccess(dispatchId: string, draftId: string, subject: string): SchedulerState {
  const current = getSchedulerState();
  current.draftRecords[dispatchId] = {
    draftId,
    draftedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
    draftUrl: 'https://mail.google.com/mail/u/0/#drafts',
    subject
  };
  saveSchedulerState(current);
  return current;
}

/**
 * Execute draft generation for a specific dispatch
 */
export async function draftDispatchToGmail(
  type: 'friday' | 'sunday' | 'tuesday',
  games: Game[],
  players: Player[],
  picks: Record<string, PlayerPickData>,
  token?: string,
  currentWeek: number = 2
): Promise<{ draftId: string; draftUrl: string; subject: string }> {
  const payload = await generateDispatchPayload(type, games, players, picks, currentWeek);
  const result = await createGmailDraft({
    subject: payload.subject,
    bodyText: payload.body,
    to: payload.to,
    bccList: payload.bccList,
    token: token || getCachedAccessToken() || undefined
  });

  const dispatchId = `dispatch-${type}`;
  recordDraftSuccess(dispatchId, result.id, payload.subject);

  return {
    draftId: result.id,
    draftUrl: result.draftUrl,
    subject: payload.subject
  };
}

/**
 * Draft all 3 weekly dispatches into Gmail in one coordinated sequence
 */
export async function draftAllDispatchesToGmail(
  games: Game[],
  players: Player[],
  picks: Record<string, PlayerPickData>,
  token?: string,
  currentWeek: number = 2
): Promise<Array<{ type: string; draftId: string; subject: string }>> {
  const types: Array<'friday' | 'sunday' | 'tuesday'> = ['friday', 'sunday', 'tuesday'];
  const results = [];

  for (const t of types) {
    const res = await draftDispatchToGmail(t, games, players, picks, token, currentWeek);
    results.push({ type: t, draftId: res.draftId, subject: res.subject });
  }

  return results;
}

export function recordSentSuccess(dispatchId: string, messageId: string, subject: string): SchedulerState {
  const current = getSchedulerState();
  if (!current.sentRecords) current.sentRecords = {};
  current.sentRecords[dispatchId] = {
    messageId,
    sentAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
    subject
  };
  saveSchedulerState(current);
  return current;
}

/**
 * Send a dispatch directly via Gmail API to the Pool Admin and Bcc to all contenders
 */
export async function sendDispatchToGmail(
  type: 'friday' | 'sunday' | 'tuesday',
  games: Game[],
  players: Player[],
  picks: Record<string, PlayerPickData>,
  token?: string,
  currentWeek: number = 2
): Promise<{ messageId: string; subject: string }> {
  const payload = await generateDispatchPayload(type, games, players, picks, currentWeek);
  const result = await sendGmailMessage({
    subject: payload.subject,
    bodyText: payload.body,
    to: payload.to,
    bccList: payload.bccList,
    token: token || getCachedAccessToken() || undefined
  });

  const dispatchId = `dispatch-${type}`;
  recordSentSuccess(dispatchId, result.id, payload.subject);

  return {
    messageId: result.id,
    subject: payload.subject
  };
}

/**
 * Send all 3 weekly dispatches directly via Gmail
 */
export async function sendAllDispatchesToGmail(
  games: Game[],
  players: Player[],
  picks: Record<string, PlayerPickData>,
  token?: string,
  currentWeek: number = 2
): Promise<Array<{ type: string; messageId: string; subject: string }>> {
  const types: Array<'friday' | 'sunday' | 'tuesday'> = ['friday', 'sunday', 'tuesday'];
  const results = [];

  for (const t of types) {
    const res = await sendDispatchToGmail(t, games, players, picks, token, currentWeek);
    results.push({ type: t, messageId: res.messageId, subject: res.subject });
  }

  return results;
}

