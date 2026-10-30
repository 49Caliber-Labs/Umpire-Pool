export interface Game {
  gameNumber: number;
  awayTeam: string;
  homeTeam: string;
  day: string;
  kickoffTime: string;
  officialWinner?: string | null;
  isTie?: boolean;
  status: 'scheduled' | 'in_progress' | 'final';
  awayScore?: number;
  homeScore?: number;
  favorite: string;
  spread: string;
  overUnder: number;
  isMNF?: boolean;
  isTNF?: boolean;
  isSNF?: boolean;
  week?: number;
  awayRecord?: string;
  homeRecord?: string;
  kickoffIso?: string;
  quarter?: string;
  clock?: string;
  statusDetail?: string;
  possession?: string;
  downDistance?: string;
  redzone?: boolean;
  lastPlay?: string;
  lastUpdated?: string;
}

export interface Player {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  role: 'admin' | 'consultant' | 'player' | 'legend';
  tagline?: string;
  isElvis?: boolean;
  isDefendingChamp?: boolean;
  isChampion?: boolean;
  paid?: boolean;
  tiebreakerDefault?: number;
  hasHandwrittenPicks?: boolean;
  isActive?: boolean;
}

export interface PlayerPickData {
  contenderName: string;
  picks: Record<number, string>; // gameNumber -> pickedTeam
  tiebreaker: number | '';
  submittedAt?: string;
}

export interface StandingsRow {
  rank: number;
  name: string;
  wins: number;
  losses: number;
  ties?: number;
  liveWins?: number;
  liveLosses?: number;
  liveTies?: number;
  projectedWins?: number;
  projectedRank?: number;
  tbPrediction: number | '';
  tbError: number | null;
  totalScore: number;
  isTiebreakWinner?: boolean;
  isElvis?: boolean;
  isConsultant?: boolean;
  isAdmin?: boolean;
  isDefendingChamp?: boolean;
  seasonWins?: number;
  seasonLosses?: number;
  seasonTies?: number;
  seasonRank?: number;
  seasonWinPct?: number;
  weeklyWinDetails?: { week: number; wins: number; losses: number; ties?: number; isCurrentWeek?: boolean }[];
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: string;
  role?: 'admin' | 'consultant' | 'player' | 'legend';
}

export interface WeeklyDispatch {
  id: string;
  type: 'friday' | 'sunday' | 'tuesday';
  week?: number;
  weekNumber?: number;
  publishedAt?: string;
  isPublished?: boolean;
  title: string;
  subtitle: string;
  timestamp: string;
  content: string;
  body_html?: string;
  pdfUrl?: string;
  imageUrl?: string;
  isPdfUpload?: boolean;
  podcastUrl?: string;
  podcastTitle?: string;
  subject?: string;
  preheader?: string;
  consultantQuote: string;
  status?: string;
  dispatch_type?: string;
  draftId?: string;
  draftUrl?: string;
}

export interface FineItem {
  id: string;
  contenderName: string;
  playerName?: string;
  amount: number; // default $1
  reason: string;
  date: string;
  timestamp?: string;
  paid: boolean;
  issuedBy: string;
}

export interface WeeklyRecord {
  week: number;
  wins: number;
  losses: number;
  ties?: number;
  tiebreaker?: number | '';
  isWinner?: boolean;
  isLocked?: boolean;
  auditedAt?: string;
  auditNotes?: string;
}

export interface SeasonRecord {
  contenderName: string;
  totalWins: number;
  totalLosses: number;
  totalTies?: number;
  weeklyBreakdown: Record<number, WeeklyRecord>; // weekNumber -> WeeklyRecord
  bestWeekWins?: number;
  weeksWonCount?: number;
  seasonRank?: number;
}

export interface SeasonHistory {
  compiledWeeks: number[]; // e.g. [1]
  lockedWeeks?: number[]; // weeks whose scores are permanently frozen against sheet edits
  records: Record<string, SeasonRecord>; // contenderName -> SeasonRecord
  lastCompiledAt?: string;
  lastAuditedAt?: string;
}
