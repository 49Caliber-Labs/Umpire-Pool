import React, { useState, useEffect, memo, useMemo } from 'react';
import { useSafeTimeout } from '../utils/performanceUtils';
import { 
  ShieldCheck, 
  Users, 
  Edit3, 
  Mail, 
  Phone, 
  Save, 
  Check, 
  Trophy, 
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  UserCheck,
  Send,
  Calendar,
  Layers,
  ChevronRight,
  RefreshCw,
  Zap,
  Clock,
  Eye,
  FileSearch,
  CheckCircle,
  Lock,
  Newspaper,
  Upload,
  Trash2,
  Headphones,
  AlertTriangle,
  Shuffle
} from 'lucide-react';
import { Game, Player, PlayerPickData, SeasonHistory, WeeklyDispatch } from '../types';
import { WeeklyAuditSection } from './WeeklyAuditSection';
import { AdminPinGate } from './AdminPinGate';
import { isAdminPinUnlocked, setAdminPinUnlocked } from '../utils/adminAuth';
import { 
  signInWithGoogle, 
  signOutGoogle,
  initGmailAuth,
  listGmailMessages, 
  getGmailMessage, 
  parsePicksFromText,
  getCachedAccessToken,
  createGmailDraft,
  sendGmailMessage
} from '../services/gmailService';
import { 
  publishDispatchGlobally, 
  removeDispatchGlobally,
  advanceWeekSafely,
  generateElvisPicksGlobally
} from '../services/poolSyncService';
import { runOperationalChecks, OperationalCheckResult } from '../services/operationalCheckService';
import { OperationalCheckModal } from './OperationalCheckModal';
import { PoolSetupConfig, DEFAULT_POOL_CONFIG } from '../config/leagueConfig';

interface AdminHubTabProps {
  games: Game[];
  players: Player[];
  picks: Record<string, PlayerPickData>;
  dispatches?: WeeklyDispatch[];
  currentWeek?: number;
  onPublishDispatch?: (dispatch: WeeklyDispatch) => Promise<void> | void;
  onDeleteDispatch?: (dispatchId: string) => Promise<void> | void;
  onUpdatePlayerContact: (id: string, email: string, phone?: string, location?: string, isActive?: boolean) => void;
  onAddContender?: (name: string, email: string, phone?: string) => Promise<{ success: boolean; error?: string }> | void;
  onAdminSavePicks: (contenderName: string, gamePicks: Record<number, string>, tiebreaker: number | '') => void;
  onUpdateGameStatus: (
    gameNumber: number, 
    winner: string | null, 
    awayScore?: number, 
    homeScore?: number, 
    status?: 'scheduled' | 'in_progress' | 'final'
  ) => void;
  onOpenFineJar?: () => void;
  onSyncLiveScores?: () => void;
  isSyncingScores?: boolean;
  lastScoreSyncTime?: string;
  autoSyncEnabled?: boolean;
  onToggleAutoSync?: () => void;
  onSimulateStep?: () => void;
  onResetWeek?: () => void;
  seasonHistory?: SeasonHistory;
  onCompileWeekResults?: (weekNumber?: number) => Promise<{ success: boolean; winnerName?: string }>;
  onAdvanceWeekSafely?: (weekNumber?: number) => Promise<{ success: boolean; nextWeek?: number; winnerName?: string; error?: string }>;
  onUpdateHistoricalWeekRecord?: (
    contenderName: string,
    weekNumber: number,
    wins: number,
    losses: number,
    tiebreaker: number | '',
    isWinner: boolean,
    isLocked?: boolean,
    auditNotes?: string
  ) => void;
  onToggleFreezeWeek?: (weekNumber: number, freeze: boolean) => void;
  onResetSeasonHistory?: () => void;
  onRepairRoster?: () => Promise<{ success: boolean; players?: Player[] }>;
  onReturnToPool?: () => void;
  poolConfig?: PoolSetupConfig;
  onOpenSetupWizard?: () => void;
}

type AdminSection = 'games' | 'overrides' | 'dispatches' | 'roster' | 'audit' | 'all';

export const AdminHubTab: React.FC<AdminHubTabProps> = memo(({
  games,
  players,
  picks,
  dispatches = [],
  currentWeek = 3,
  onPublishDispatch,
  onDeleteDispatch,
  onUpdatePlayerContact,
  onAddContender,
  onAdminSavePicks,
  onUpdateGameStatus,
  onOpenFineJar,
  onSyncLiveScores,
  isSyncingScores = false,
  lastScoreSyncTime,
  autoSyncEnabled = true,
  onToggleAutoSync,
  onSimulateStep,
  onResetWeek,
  seasonHistory,
  onCompileWeekResults,
  onAdvanceWeekSafely,
  onUpdateHistoricalWeekRecord,
  onToggleFreezeWeek,
  onResetSeasonHistory,
  onRepairRoster,
  onReturnToPool,
  poolConfig = DEFAULT_POOL_CONFIG,
  onOpenSetupWizard
}) => {
  const { setSafeTimeout } = useSafeTimeout();
  const [isUnlocked, setIsUnlocked] = useState<boolean>(isAdminPinUnlocked);

  useEffect(() => {
    const handleAuthChange = () => {
      setIsUnlocked(isAdminPinUnlocked());
    };
    window.addEventListener('admin_auth_changed', handleAuthChange);
    return () => window.removeEventListener('admin_auth_changed', handleAuthChange);
  }, []);

  const [activeSection, setActiveSection] = useState<AdminSection>('games');

  // Operational Checks State
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [isRunningChecks, setIsRunningChecks] = useState(false);
  const [verificationResults, setVerificationResults] = useState<OperationalCheckResult[]>([]);

  const handleRunOperationalChecks = async () => {
    setIsRunningChecks(true);
    setIsVerificationModalOpen(true);
    try {
      const results = await runOperationalChecks({
        games,
        players,
        picks,
        dispatches
      });
      setVerificationResults(results);
    } catch (err) {
      console.error('Failed to execute operational checks:', err);
    } finally {
      setIsRunningChecks(false);
    }
  };
  
  // Gmail Recovery State
  const [isGmailScanning, setIsGmailScanning] = useState(false);
  const [gmailResults, setGmailResults] = useState<{ id: string; subject: string; from: string; snippet: string; parsedPicks?: any; parsedTb?: any; body?: string }[]>([]);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [isGmailAuthed, setIsGmailAuthed] = useState(!!getCachedAccessToken());

  // Vision Recovery State
  const [isVisionParsing, setIsVisionParsing] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [visionImage, setVisionImage] = useState<string | null>(null);

  // Pick Overrider State
  const [selectedContender, setSelectedContender] = useState<string>(players[0]?.name || poolConfig.adminName || 'Pool Admin');
  const [editingPicks, setEditingPicks] = useState<Record<number, string>>({});
  const [editingTiebreaker, setEditingTiebreaker] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Add New Contender State (Midseason / Anytime Onboarding)
  const [newContenderName, setNewContenderName] = useState<string>('');
  const [newContenderEmail, setNewContenderEmail] = useState<string>('');
  const [newContenderPhone, setNewContenderPhone] = useState<string>('');
  const [isAddingContender, setIsAddingContender] = useState<boolean>(false);

  // Game Results Filter & Quick Inputs
  const [gameFilter, setGameFilter] = useState<'all' | 'final' | 'live' | 'scheduled'>('all');
  const [gameScoresInput, setGameScoresInput] = useState<Record<number, { away: string; home: string }>>(() => {
    const map: Record<number, { away: string; home: string }> = {};
    games.forEach(g => {
      map[g.gameNumber] = {
        away: g.awayScore !== undefined ? String(g.awayScore) : '',
        home: g.homeScore !== undefined ? String(g.homeScore) : ''
      };
    });
    return map;
  });

  // Keep score inputs properly in sync whenever games prop updates
  useEffect(() => {
    setGameScoresInput(prev => {
      const updated = { ...prev };
      games.forEach(g => {
        updated[g.gameNumber] = {
          away: g.awayScore !== undefined ? String(g.awayScore) : '',
          home: g.homeScore !== undefined ? String(g.homeScore) : ''
        };
      });
      return updated;
    });
  }, [games]);

  // Roster Management State
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [rosterStatusFilter, setRosterStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editEmail, setEditEmail] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [rosterUpdateMsg, setRosterUpdateMsg] = useState<string | null>(null);

  // Dispatch Operations Deck State (Filtered by poolConfig.dispatchCadence)
  const dispatchCadence = poolConfig.dispatchCadence || 1;
  const activeDispatchSlots = useMemo(() => {
    const allSlots = [
      { id: 'friday' as const, label: 'Friday Night Wire', tag: 'Slot 1', schedule: 'Fri 6:00 PM PST', desc: 'TNF recap, injury wire & weekend preview' },
      { id: 'sunday' as const, label: 'Sunday Night Recap', tag: 'Slot 2', schedule: 'Sun 8:30 PM PST', desc: 'Sunday frenzy, podium shuffle & MNF preview' },
      { id: 'tuesday' as const, label: 'Tuesday Final', tag: dispatchCadence === 1 ? 'Weekly Final' : 'Slot 3', schedule: 'Tue 7:30 AM PST', desc: 'MNF climax, weekly crown & locked standings' }
    ];
    if (dispatchCadence === 1) return allSlots.filter(s => s.id === 'tuesday');
    if (dispatchCadence === 2) return allSlots.filter(s => s.id === 'sunday' || s.id === 'tuesday');
    return allSlots;
  }, [dispatchCadence]);

  const [activeSlot, setActiveSlot] = useState<'friday' | 'sunday' | 'tuesday'>(() => {
    try {
      if (dispatchCadence === 1) return 'tuesday';
      const now = new Date();
      const pstDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(now);
      if (pstDay === 'Tue' || pstDay === 'Wed' || pstDay === 'Thu') return 'tuesday';
      if (pstDay === 'Fri' || pstDay === 'Sat') return dispatchCadence === 2 ? 'sunday' : 'friday';
      return 'sunday';
    } catch (e) {
      return 'tuesday';
    }
  });

  useEffect(() => {
    if (dispatchCadence === 1 && activeSlot !== 'tuesday') {
      setActiveSlot('tuesday');
    } else if (dispatchCadence === 2 && activeSlot === 'friday') {
      setActiveSlot('tuesday');
    }
  }, [dispatchCadence, activeSlot]);
  const [isGeneratingDispatch, setIsGeneratingDispatch] = useState<boolean>(false);
  const [isDeletingDispatch, setIsDeletingDispatch] = useState<boolean>(false);
  const [draftingDispatchId, setDraftingDispatchId] = useState<string | null>(null);
  const [sendingDispatchId, setSendingDispatchId] = useState<string | null>(null);
  const [dispatchActionSuccess, setDispatchActionSuccess] = useState<string | null>(null);
  const [dispatchActionError, setDispatchActionError] = useState<string | null>(null);

  // Edit rich content modal state
  const [isEditingHtml, setIsEditingHtml] = useState<boolean>(false);
  const [editSubject, setEditSubject] = useState<string>('');
  const [editPreheader, setEditPreheader] = useState<string>('');
  const [editedHtml, setEditedHtml] = useState<string>('');
  const [editQuote, setEditQuote] = useState<string>('');

  // Podcast state
  const [isEditingPodcast, setIsEditingPodcast] = useState<boolean>(false);
  const [podcastUrlInput, setPodcastUrlInput] = useState<string>('');
  const [podcastTitleInput, setPodcastTitleInput] = useState<string>('');

  // Gmail Auth for dispatches
  const [isGmailConnected, setIsGmailConnected] = useState<boolean>(false);
  const [gmailUserEmail, setGmailUserEmail] = useState<string>(poolConfig.adminEmail || '');
  const [isAuthorizingGmail, setIsAuthorizingGmail] = useState<boolean>(false);

  // Standings Vault Freeze & Week Advance state
  const [isAdvancingWeek, setIsAdvancingWeek] = useState<boolean>(false);
  const [advanceMsg, setAdvanceMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFreezeAndAdvance = async () => {
    const confirmMsg = `🔒 STANDINGS VAULT FREEZE & ADVANCE:\n\nAre you sure you want to permanently freeze Week ${currentWeek} scores into the Historical Vault, archive all submitted pick sheets, and advance the pool to Week ${currentWeek + 1}?\n\n• Season total wins will be permanently preserved.\n• Active pick sheets will reset to clean slates for Week ${currentWeek + 1}.\n• Week ${currentWeek} will be permanently anchored into the vault.\n• ESPN schedule and live odds for Week ${currentWeek + 1} will be automatically scraped and loaded.`;
    if (!window.confirm(confirmMsg)) return;

    setIsAdvancingWeek(true);
    setAdvanceMsg(null);
    try {
      const runner = onAdvanceWeekSafely || advanceWeekSafely;
      const res = await runner(currentWeek);
      if (res.success) {
        setAdvanceMsg({
          type: 'success',
          text: `Week ${currentWeek} successfully frozen into vault! Winner crowned: ${res.winnerName || 'Official Leader'}. Pool advanced to Week ${res.nextWeek || (currentWeek + 1)}.`
        });
      } else {
        setAdvanceMsg({
          type: 'error',
          text: `Could not advance week: ${res.error || 'Server error'}`
        });
      }
    } catch (err: any) {
      setAdvanceMsg({
        type: 'error',
        text: `Error advancing week: ${err.message}`
      });
    } finally {
      setIsAdvancingWeek(false);
    }
  };

  useEffect(() => {
    const unsub = initGmailAuth(
      (user, token) => {
        setIsGmailConnected(true);
        setGmailUserEmail(user.email || poolConfig.adminEmail || '');
        if (token) {
          fetch('/api/auth/google-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          }).catch(() => {});
        }
      },
      () => {
        setIsGmailConnected(false);
      }
    );
    return () => unsub();
  }, []);

  const handleSignInGmail = async () => {
    setIsAuthorizingGmail(true);
    setDispatchActionError(null);
    try {
      const res = await signInWithGoogle();
      setIsGmailConnected(true);
      if (res.user?.email) {
        setGmailUserEmail(res.user.email);
      }
      if (res.token) {
        fetch('/api/auth/google-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: res.token })
        }).catch(() => {});
      }
      setDispatchActionSuccess('Connected to Google Account for live dispatch delivery!');
      setSafeTimeout(() => setDispatchActionSuccess(null), 3500);
    } catch (err: any) {
      console.error('[AdminHubTab] Sign-in error:', err);
      setDispatchActionError(err.message || 'Failed to authenticate with Google');
    } finally {
      setIsAuthorizingGmail(false);
    }
  };

  const handleSignOutGmail = async () => {
    try {
      await signOutGoogle();
      setIsGmailConnected(false);
      setDispatchActionSuccess('Disconnected Google account.');
      setSafeTimeout(() => setDispatchActionSuccess(null), 3000);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const currentSlotDispatch = useMemo(() => {
    const matching = (dispatches || []).filter(d => {
      const isCorrectSlot = d.type === activeSlot || d.id === `dispatch-${activeSlot}` || d.id?.startsWith(`dispatch-${activeSlot}-`);
      const isNotFuture = (d.week || 0) <= (currentWeek || 3);
      return isCorrectSlot && isNotFuture;
    });
    if (matching.length === 0) return null;
    matching.sort((a, b) => (b.week || 0) - (a.week || 0));
    return matching[0];
  }, [dispatches, activeSlot, currentWeek]);

  const handleTriggerTuesdayPipeline = async () => {
    if (!window.confirm(`⚡ TUESDAY MASTER PIPELINE (FREEZE, DISPATCH & ROLLOVER):\n\nAre you sure you want to execute the complete atomic Tuesday cycle for Week ${currentWeek}?\n\n1. Ingest official final scores & verify MNF tiebreaker\n2. Crown weekly winner & freeze scores to Historical Vault\n3. Generate & stage Tuesday Crown Dispatch to Gmail\n4. Archive submitted pick sheets to disk\n5. Advance schedule to Week ${currentWeek + 1} & query ESPN spreads\n6. Reset pick sheets and spreadsheet to pristine clean slates\n7. Populate Elvis with Vegas favorites for the new games`)) {
      return;
    }

    setIsGeneratingDispatch(true);
    setIsAdvancingWeek(true);
    setDispatchActionError(null);
    try {
      const res = await fetch('/api/admin/trigger-tuesday-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekNumber: currentWeek })
      });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      if (data.dispatch) {
        if (onPublishDispatch) {
          await onPublishDispatch(data.dispatch);
        } else {
          await publishDispatchGlobally(data.dispatch);
        }
      }
      if (onAdvanceWeekSafely) {
        await onAdvanceWeekSafely(currentWeek);
      }
      const draftMsg = data.gmailDraftResult?.success
        ? '✓ Draft placed in Gmail (#drafts)'
        : (data.gmailDraftResult?.status === 'awaiting_token' ? 'Draft ready for browser Gmail sync' : '');
      setDispatchActionSuccess(`🎉 Tuesday Master Pipeline Complete! Crowned ${data.winnerName || 'Leader'} for Week ${data.weekFinalized || currentWeek}. Standings frozen, picks & spreadsheet reset, and pool rolled over to Week ${data.nextWeek || (currentWeek + 1)}. ${draftMsg}`);
      setSafeTimeout(() => setDispatchActionSuccess(null), 6000);
    } catch (err: any) {
      console.error('Tuesday pipeline error:', err);
      setDispatchActionError('Tuesday sequence error: ' + err.message);
    } finally {
      setIsGeneratingDispatch(false);
      setIsAdvancingWeek(false);
    }
  };

  const handleGenerateVibrantDispatch = async () => {
    if (activeSlot === 'tuesday') {
      await handleTriggerTuesdayPipeline();
      return;
    }
    setIsGeneratingDispatch(true);
    setDispatchActionError(null);
    try {
      const res = await fetch('/api/admin/clock-test-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activeSlot, weekNumber: currentWeek })
      });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      const generated = data.dispatch;
      if (onPublishDispatch) {
        await onPublishDispatch(generated);
      } else {
        await publishDispatchGlobally(generated);
      }
      setDispatchActionSuccess(`✨ Generated & published ${generated.title}!`);
      setSafeTimeout(() => setDispatchActionSuccess(null), 4000);
    } catch (err: any) {
      console.error('Generation error:', err);
      setDispatchActionError('Failed to generate dispatch: ' + err.message);
    } finally {
      setIsGeneratingDispatch(false);
    }
  };

  const handleShuffleVibrantDispatch = async () => {
    setIsGeneratingDispatch(true);
    setDispatchActionError(null);
    try {
      const res = await fetch('/api/admin/generate-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeSlot,
          weekNumber: currentWeek,
          shuffle: true,
          seed: Date.now()
        })
      });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      const generated = data.dispatch;
      if (onPublishDispatch) {
        await onPublishDispatch(generated);
      } else {
        await publishDispatchGlobally(generated);
      }
      setDispatchActionSuccess(`🎲 Successfully shuffled & rewritten ${activeSlot === 'friday' ? 'Friday Wire' : activeSlot === 'sunday' ? 'Sunday Recap' : 'Tuesday Crown'} with fresh Gemini AI commentary!`);
      setSafeTimeout(() => setDispatchActionSuccess(null), 5000);
    } catch (err: any) {
      console.error('Shuffle dispatch error:', err);
      setDispatchActionError('Shuffle error: ' + err.message);
    } finally {
      setIsGeneratingDispatch(false);
    }
  };

  const handleTriggerSundayPipeline = async () => {
    setIsGeneratingDispatch(true);
    setDispatchActionError(null);
    try {
      const res = await fetch('/api/admin/trigger-sunday-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekNumber: currentWeek })
      });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      if (data.dispatch) {
        if (onPublishDispatch) {
          await onPublishDispatch(data.dispatch);
        } else {
          await publishDispatchGlobally(data.dispatch);
        }
      }
      const draftMsg = data.gmailDraftResult?.success 
        ? '✓ Draft placed in Gmail (#drafts)' 
        : (data.gmailDraftResult?.status === 'awaiting_token' ? 'Draft ready for browser Gmail sync' : '');
      setDispatchActionSuccess(`⚡ Sunday Night Sequence executed! Standings saved to storage & cloud. ${draftMsg}`);
      setSafeTimeout(() => setDispatchActionSuccess(null), 5000);
    } catch (err: any) {
      console.error('Sunday pipeline error:', err);
      setDispatchActionError('Sunday sequence error: ' + err.message);
    } finally {
      setIsGeneratingDispatch(false);
    }
  };

  const handleUploadDispatchDocument = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const reader = new FileReader();
    reader.onload = async (uploadEv) => {
      const dataUrl = uploadEv.target?.result as string;
      const slotLabel = activeSlot === 'friday' ? 'Friday Night Wire' : activeSlot === 'sunday' ? 'Sunday Night Recap' : 'Tuesday Final';
      const newDispatch: WeeklyDispatch = {
        id: `dispatch-${activeSlot}`,
        type: activeSlot,
        week: currentWeek,
        weekNumber: currentWeek,
        title: `${slotLabel} • Week ${currentWeek}`,
        subtitle: `Custom uploaded ${isPdf ? '8.5" × 11" PDF BroadSheet' : 'Scan Image'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        publishedAt: new Date().toISOString(),
        isPublished: true,
        content: isPdf ? '' : `<div style='text-align:center;'><img src='${dataUrl}' style='max-width:100%; border-radius:8px;'/></div>`,
        isPdfUpload: isPdf,
        pdfUrl: isPdf ? dataUrl : undefined,
        imageUrl: !isPdf ? dataUrl : undefined,
        subject: `[${poolConfig.leagueName}] 🏈 ${slotLabel} • Week ${currentWeek}`,
        preheader: `Custom uploaded document for ${slotLabel}`,
        consultantQuote: 'Winners Walk, Losers Stalk!'
      };
      if (onPublishDispatch) await onPublishDispatch(newDispatch);
      else await publishDispatchGlobally(newDispatch);
      setDispatchActionSuccess(`Uploaded ${file.name} to ${slotLabel}!`);
      setSafeTimeout(() => setDispatchActionSuccess(null), 4000);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveEditedHtml = async () => {
    if (!currentSlotDispatch) return;
    const updated: WeeklyDispatch = {
      ...currentSlotDispatch,
      subject: editSubject || currentSlotDispatch.subject,
      preheader: editPreheader || currentSlotDispatch.preheader,
      content: editedHtml,
      body_html: editedHtml,
      consultantQuote: editQuote || currentSlotDispatch.consultantQuote,
      publishedAt: new Date().toISOString()
    };
    if (onPublishDispatch) await onPublishDispatch(updated);
    else await publishDispatchGlobally(updated);
    setIsEditingHtml(false);
    setDispatchActionSuccess(`Saved & published custom edits to ${currentSlotDispatch.title}!`);
    setSafeTimeout(() => setDispatchActionSuccess(null), 4000);
  };

  const handleSavePodcast = async () => {
    if (!currentSlotDispatch) return;
    const updated: WeeklyDispatch = {
      ...currentSlotDispatch,
      podcastUrl: podcastUrlInput.trim() || undefined,
      podcastTitle: podcastTitleInput.trim() || undefined,
      publishedAt: new Date().toISOString()
    };
    if (onPublishDispatch) await onPublishDispatch(updated);
    else await publishDispatchGlobally(updated);
    setIsEditingPodcast(false);
    setDispatchActionSuccess(`Attached 5-minute podcast review link!`);
    setSafeTimeout(() => setDispatchActionSuccess(null), 4000);
  };

  const handleRemoveDispatch = async () => {
    if (!currentSlotDispatch) return;
    if (!window.confirm(`Permanently remove "${currentSlotDispatch.title}" from public view?`)) return;
    setIsDeletingDispatch(true);
    try {
      if (onDeleteDispatch) await onDeleteDispatch(currentSlotDispatch.id);
      else await removeDispatchGlobally(currentSlotDispatch.id);
      setDispatchActionSuccess(`Removed "${currentSlotDispatch.title}" from public view.`);
      setSafeTimeout(() => setDispatchActionSuccess(null), 4000);
    } catch (err: any) {
      setDispatchActionError('Remove error: ' + err.message);
    } finally {
      setIsDeletingDispatch(false);
    }
  };

  const handleDraftDispatch = async (d: WeeklyDispatch) => {
    setDraftingDispatchId(d.id);
    setDispatchActionError(null);
    try {
      let token = getCachedAccessToken();
      if (!token) {
        const authRes = await signInWithGoogle();
        token = authRes.token;
        if (token) {
          fetch('/api/auth/google-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          }).catch(() => {});
        }
      }

      const activeEmails = players.filter(p => p.isActive !== false && !p.isElvis).map(p => p.email);
      const adminEmail = players.find(p => p.role === 'admin')?.email || poolConfig.adminEmail || gmailUserEmail;
      const draftRes = await createGmailDraft({
        subject: d.subject || d.title,
        bodyText: d.body_html || d.content || '',
        to: adminEmail,
        bccList: activeEmails,
        token: token || undefined
      });

      const updatedDispatch: WeeklyDispatch = {
        ...d,
        status: 'drafted',
        draftId: draftRes.id,
        draftUrl: draftRes.draftUrl
      };

      if (onPublishDispatch) {
        await onPublishDispatch(updatedDispatch);
      } else {
        await publishDispatchGlobally(updatedDispatch);
      }

      setDispatchActionSuccess(`✉️ Successfully created draft in Gmail (${activeEmails.length} contenders on BCC)!`);
      setSafeTimeout(() => setDispatchActionSuccess(null), 5000);
    } catch (err: any) {
      setDispatchActionError(err.message || 'Draft failed. Check Gmail connection.');
    } finally {
      setDraftingDispatchId(null);
    }
  };

  const handleSendDispatch = async (d: WeeklyDispatch) => {
    const activeEmails = players.filter(p => p.isActive !== false && !p.isElvis).map(p => p.email);
    if (!window.confirm(`BROADCAST DISPATCH:\n\nSend "${d.title}" to ${activeEmails.length} contenders via Gmail?`)) return;
    setSendingDispatchId(d.id);
    setDispatchActionError(null);
    try {
      const adminEmail = players.find(p => p.role === 'admin')?.email || poolConfig.adminEmail || gmailUserEmail;
      await sendGmailMessage({
        subject: d.subject || d.title,
        bodyText: d.content || d.body_html || '',
        to: adminEmail,
        bccList: activeEmails,
        token: getCachedAccessToken() || undefined
      });
      setDispatchActionSuccess(`🚀 Successfully broadcasted "${d.title}" to ${activeEmails.length} contenders!`);
      setSafeTimeout(() => setDispatchActionSuccess(null), 5000);
    } catch (err: any) {
      setDispatchActionError(err.message || 'Broadcast failed. Check Gmail connection.');
    } finally {
      setSendingDispatchId(null);
    }
  };

  // Load selected player's picks into editor
  useEffect(() => {
    const existing = picks[selectedContender];
    if (existing) {
      setEditingPicks({ ...existing.picks });
      setEditingTiebreaker(existing.tiebreaker !== '' ? String(existing.tiebreaker) : '');
    } else {
      setEditingPicks({});
      setEditingTiebreaker('');
    }
  }, [selectedContender, picks]);

  const handleAdminPickChange = (gameNumber: number, team: string) => {
    setEditingPicks(prev => ({
      ...prev,
      [gameNumber]: team
    }));
  };

  const handleSaveAdminPicks = (e: React.FormEvent) => {
    e.preventDefault();
    const tbVal = editingTiebreaker !== '' ? Number(editingTiebreaker) : '';
    onAdminSavePicks(selectedContender, editingPicks, tbVal);
    setSaveSuccessMsg(`Picks successfully saved for ${selectedContender}!`);
    setSafeTimeout(() => setSaveSuccessMsg(null), 3500);
  };

  const handleFillVegasFavorites = () => {
    const vegasPicks: Record<number, string> = {};
    games.forEach(g => {
      vegasPicks[g.gameNumber] = g.favorite || g.homeTeam;
    });
    const mnf = games.find(g => g.isMNF);
    const tbVal = mnf && mnf.overUnder ? String(Math.round(mnf.overUnder)) : '48';
    setEditingPicks(vegasPicks);
    setEditingTiebreaker(tbVal);
    setSaveSuccessMsg(`Filled Vegas Insider favorites for ${selectedContender}! Remember to click "Save Official Picks".`);
    setSafeTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  const handleCopyElvisPicks = () => {
    const elvisPicks = picks['Elvis']?.picks || picks['Elvis Presley']?.picks;
    if (elvisPicks && Object.keys(elvisPicks).length > 0) {
      setEditingPicks({ ...elvisPicks });
      const tb = picks['Elvis']?.tiebreaker || picks['Elvis Presley']?.tiebreaker || '48';
      setEditingTiebreaker(String(tb));
      setSaveSuccessMsg(`Loaded Elvis's official slate for ${selectedContender}! Remember to click Save.`);
    } else {
      handleFillVegasFavorites();
    }
  };

  const [isSyncingElvis, setIsSyncingElvis] = useState(false);
  const handleSyncElvisToBoard = async () => {
    setIsSyncingElvis(true);
    try {
      const res = await generateElvisPicksGlobally();
      if (res.success && res.elvisPicks) {
        onAdminSavePicks('Elvis', res.elvisPicks.picks, res.elvisPicks.tiebreaker);
        if (selectedContender === 'Elvis') {
          setEditingPicks({ ...res.elvisPicks.picks });
          setEditingTiebreaker(String(res.elvisPicks.tiebreaker));
        }
        setSaveSuccessMsg(`✓ Elvis (The King) picks updated with Vegas favorites and locked on the board!`);
        setSafeTimeout(() => setSaveSuccessMsg(null), 5000);
      } else {
        const vegasPicks: Record<number, string> = {};
        games.forEach(g => {
          vegasPicks[g.gameNumber] = g.favorite || g.homeTeam;
        });
        const mnf = games.find(g => g.isMNF);
        const tb = mnf && mnf.overUnder ? Math.round(mnf.overUnder) : 48;
        onAdminSavePicks('Elvis', vegasPicks, tb);
        setSaveSuccessMsg(`✓ Elvis (The King) picks saved on the board!`);
        setSafeTimeout(() => setSaveSuccessMsg(null), 5000);
      }
    } catch (e: any) {
      console.error('Failed to sync Elvis:', e);
    } finally {
      setIsSyncingElvis(false);
    }
  };

  // Gmail Sync Handler
  const handleGmailSync = async () => {
    setIsGmailScanning(true);
    setGmailError(null);
    setGmailResults([]);

    try {
      // 1. Ensure Auth
      const { token } = await signInWithGoogle();
      setIsGmailAuthed(true);

      // 2. Search for relevant emails
      // Look for emails with "picks" or "NFL pool" after Sept 1st 2026
      const query = `label:inbox {picks "nfl pool"} after:2026/09/01`;
      const messages = await listGmailMessages(query, token);

      if (messages.length === 0) {
        setGmailError("No recent emails matching 'picks' or 'NFL pool' were found in your inbox.");
        return;
      }

      const parsedResults = [];

      // 3. Fetch and parse each message
      for (const msg of messages.slice(0, 15)) {
        const fullMsg = await getGmailMessage(msg.id, token);
        const headers = fullMsg.payload.headers;
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find((h: any) => h.name === 'From')?.value || '(Unknown)';
        
        let body = '';
        const findTextPart = (part: any): string => {
          if (part.mimeType === 'text/plain' && part.body.data) {
            return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
          if (part.parts) {
            for (const sub of part.parts) {
              const res = findTextPart(sub);
              if (res) return res;
            }
          }
          return '';
        };

        body = findTextPart(fullMsg.payload);
        if (!body && fullMsg.payload.body?.data) {
          body = atob(fullMsg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }

        if (body) {
          const { picks: foundPicks, tiebreaker: foundTb } = parsePicksFromText(body, games);
          if (Object.keys(foundPicks).length > 0) {
            parsedResults.push({
              id: msg.id,
              subject,
              from,
              snippet: fullMsg.snippet,
              parsedPicks: foundPicks,
              parsedTb: foundTb,
              body
            });
          }
        }
      }

      if (parsedResults.length === 0) {
        setGmailError("Found emails, but couldn't extract formatted picks from the body. You may need to enter them manually from your email.");
      } else {
        setGmailResults(parsedResults);
      }
    } catch (err: any) {
      console.error('Gmail Sync Error:', err);
      setGmailError(err.message || 'Failed to sync with Gmail.');
    } finally {
      setIsGmailScanning(false);
    }
  };

  const handleApplyGmailPicks = (result: any) => {
    const fromLower = result.from.toLowerCase();
    const subjectLower = result.subject.toLowerCase();
    
    const matchedPlayer = players.find(p => 
      fromLower.includes(p.email.toLowerCase()) || 
      fromLower.includes(p.name.toLowerCase()) ||
      subjectLower.includes(p.name.toLowerCase())
    );

    if (matchedPlayer) {
      setSelectedContender(matchedPlayer.name);
      setEditingPicks(result.parsedPicks);
      setEditingTiebreaker(result.parsedTb !== '' ? String(result.parsedTb) : '');
      setActiveSection('overrides');
      setSaveSuccessMsg(`Extracted picks from ${matchedPlayer.name}'s email! Review and Save below.`);
    } else {
      setEditingPicks(result.parsedPicks);
      setEditingTiebreaker(result.parsedTb !== '' ? String(result.parsedTb) : '');
      setActiveSection('overrides');
      setSaveSuccessMsg(`Extracted picks from email. Select the correct contender below to save.`);
    }
    
    setSafeTimeout(() => setSaveSuccessMsg(null), 5000);
    // Scroll to overrides
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Vision Sync Handler
  const handleVisionSync = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVisionParsing(true);
    setVisionError(null);
    
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setVisionImage(base64);
      
      try {
        const response = await fetch('/api/picks/parse-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            image: base64.split(',')[1],
            games
          })
        });

        if (!response.ok) throw new Error('Vision service failed to parse the image.');
        
        const data = await response.json();
        if (data.picks && Object.keys(data.picks).length > 0) {
          setEditingPicks(data.picks);
          setEditingTiebreaker(data.tiebreaker !== undefined ? String(data.tiebreaker) : '');
          setActiveSection('overrides');
          setSaveSuccessMsg('Vision AI successfully parsed the pick sheet! Please verify and click Save.');
        } else {
          setVisionError("AI couldn't find any clear picks in this image. Please ensure it's a clear shot of a pick sheet.");
        }
      } catch (err: any) {
        setVisionError(err.message || 'Vision parse failed.');
      } finally {
        setIsVisionParsing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Score management handlers
  const handleScoreInputChange = (gameNumber: number, field: 'away' | 'home', val: string) => {
    setGameScoresInput(prev => ({
      ...prev,
      [gameNumber]: {
        ...prev[gameNumber],
        [field]: val
      }
    }));
  };

  const handleSaveScoreAndWinner = (game: Game, explicitWinner?: string) => {
    const scores = gameScoresInput[game.gameNumber];
    const awayNum = scores?.away !== '' && scores?.away !== undefined ? Number(scores.away) : game.awayScore;
    const homeNum = scores?.home !== '' && scores?.home !== undefined ? Number(scores.home) : game.homeScore;

    let winner = explicitWinner !== undefined ? explicitWinner : game.officialWinner;
    if (explicitWinner === undefined && awayNum !== undefined && homeNum !== undefined) {
      if (awayNum > homeNum) winner = game.awayTeam;
      else if (homeNum > awayNum) winner = game.homeTeam;
      else if (awayNum === homeNum) winner = 'TIE';
    }

    onUpdateGameStatus(game.gameNumber, winner ?? null, awayNum, homeNum, 'final');
  };

  const handleOpenEditPlayer = (player: Player) => {
    setEditingPlayer(player);
    setEditEmail(player.email);
    setEditPhone(player.phone || '');
    setEditLocation(player.location || '');
    setEditIsActive(player.isActive !== false);
  };

  const handleSavePlayerContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPlayer) {
      onUpdatePlayerContact(editingPlayer.id, editEmail, editPhone, editLocation, editIsActive);
      setRosterUpdateMsg(`Updated contact info & status for ${editingPlayer.name}!`);
      setEditingPlayer(null);
      setSafeTimeout(() => setRosterUpdateMsg(null), 3000);
    }
  };

  // Filtered games
  const filteredGames = games.filter(g => {
    if (gameFilter === 'final') return g.status === 'final';
    if (gameFilter === 'live') return g.status === 'in_progress';
    if (gameFilter === 'scheduled') return g.status === 'scheduled';
    return true;
  });

  // Filtered roster
  const activeRosterCount = players.filter(p => p.isActive !== false).length;
  const inactiveRosterCount = players.filter(p => p.isActive === false).length;

  const filteredPlayers = players.filter(p => {
    if (rosterStatusFilter === 'active' && p.isActive === false) return false;
    if (rosterStatusFilter === 'inactive' && p.isActive !== false) return false;
    const q = rosterSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) || 
      p.email.toLowerCase().includes(q) ||
      (p.location && p.location.toLowerCase().includes(q))
    );
  });

  // Audit calculations
  const totalContenders = players.filter(p => p.isActive !== false).length;
  const submittedContenders = players.filter(p => {
    if (p.isActive === false) return false;
    const playerPicks = picks[p.name]?.picks;
    return playerPicks && Object.keys(playerPicks).length === games.length;
  });
  const missingPlayers = players.filter(p => {
    if (p.isActive === false) return false;
    const playerPicks = picks[p.name]?.picks;
    return !playerPicks || Object.keys(playerPicks).length < games.length;
  });

  const decidedCount = games.filter(g => g.status === 'final').length;

  if (!isUnlocked) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <AdminPinGate
          title="Admin Hub Restricted Access"
          description="Enter the 4-digit administrator PIN to access pool management, scoring overrides, roster tools, and system recovery."
          onSuccess={() => setIsUnlocked(true)}
          onCancel={onReturnToPool}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-3 sm:px-6 space-y-6">
      {/* High-Contrast Pool Admin Header */}
      <div className="bg-[#12281d] text-white rounded-2xl p-5 sm:p-6 border-2 border-[#1c402e] shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-13 h-13 rounded-xl bg-emerald-700 border-2 border-emerald-400 flex items-center justify-center text-3xl shadow-md shrink-0">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Admin Dugout & Control Hub
              </h2>
              <span className="bg-amber-400 text-slate-950 text-xs px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider border border-amber-300">
                Admin: {poolConfig.adminName}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-emerald-200 mt-1 font-medium">
              {poolConfig.leagueName} • Official score entry, phone-in pick recording, and roster management.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
          {onOpenSetupWizard && (
            <button
              type="button"
              onClick={onOpenSetupWizard}
              className="flex items-center justify-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs px-3.5 py-2 rounded-xl border-2 border-amber-300 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
              title="Open Pool Setup Wizard to configure League Name, Equipment Goals, Buy-in, Dispatch Cadence, and Roster"
            >
              <span>⚙️ Pool Setup Wizard</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setAdminPinUnlocked(false)}
            className="flex items-center justify-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 text-amber-300 font-black text-xs px-3 py-2 rounded-xl border border-amber-400/40 transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
            title="Lock the Admin Hub and Dispatch Controls"
          >
            <Lock className="w-3.5 h-3.5 text-amber-300" />
            <span>Lock Admin Hub</span>
          </button>

          {onOpenFineJar && (
            <button
              onClick={onOpenFineJar}
              className="flex items-center justify-center bg-amber-400 hover:bg-amber-300 text-slate-950 px-2.5 py-1 rounded-lg border border-amber-300 text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 whitespace-nowrap"
              title="$1 Umpire Fine Jar (Pool Banter & Tradition)"
            >
              <span>$1 Fine Jar</span>
            </button>
          )}
        </div>
      </div>

      {/* MASTER CLOCK & STANDINGS VAULT FREEZE / RESET ACTION DECK */}
      <div className="bg-gradient-to-br from-[#062419] via-[#0b3323] to-[#041a12] text-white rounded-2xl p-5 sm:p-6 border-2 border-amber-400 shadow-lg">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-amber-400 text-slate-950 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wider shadow-xs">
                Master Clock & Vault Engine
              </span>
              <span className="bg-emerald-800/80 text-emerald-200 border border-emerald-500/40 text-xs font-bold px-2 py-0.5 rounded-lg">
                Week {currentWeek} Active Slate
              </span>
              {seasonHistory?.compiledWeeks && seasonHistory.compiledWeeks.length > 0 && (
                <span className="text-[11px] text-emerald-300 font-medium">
                  Weeks {seasonHistory.compiledWeeks.join(', ')} Frozen in Vault
                </span>
              )}
            </div>

            <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-300" />
              <span>Standings Vault Freeze & Autonomous Week Advancement</span>
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Permanently certifies and locks Week {currentWeek} scores into the Historical Standings Vault, archives submitted pick sheets to disk, resets contender sheets to clean slates for Week {currentWeek + 1}, and queries ESPN to stage the new matchup schedule and live point spreads.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] text-emerald-200/90 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 font-bold">1.</span> Evaluates straight-up wins & MNF tiebreakers.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 font-bold">2.</span> Seals cumulative season totals permanently.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 font-bold">3.</span> Dumps master pick audit to disk archive.
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 font-bold">4.</span> Rolls board over to Week {currentWeek + 1} clean sheets.
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch gap-2 w-full lg:w-auto shrink-0 pt-2 lg:pt-0">
            <button
              type="button"
              onClick={handleFreezeAndAdvance}
              disabled={isAdvancingWeek}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-6 py-3.5 rounded-xl text-xs sm:text-sm shadow-md flex items-center justify-center gap-2.5 transition-all border-2 border-amber-300 cursor-pointer disabled:opacity-50 active:scale-95 whitespace-nowrap"
              title={`Permanently freeze Week ${currentWeek} into the Historical Vault and advance to Week ${currentWeek + 1}`}
            >
              <Lock className="w-4 h-4 text-slate-950" />
              <span>{isAdvancingWeek ? 'Freezing Standings...' : `Freeze Standings & Advance to Week ${currentWeek + 1}`}</span>
            </button>
            <span className="text-[10px] text-center text-slate-400 font-medium">
              Requires confirmation • Irreversible vault action
            </span>
          </div>
        </div>

        {advanceMsg && (
          <div className={`mt-4 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2.5 ${
            advanceMsg.type === 'success' 
              ? 'bg-emerald-500/25 border-2 border-emerald-400 text-emerald-100' 
              : 'bg-rose-500/25 border-2 border-rose-400 text-rose-100'
          }`}>
            <span className="text-sm">{advanceMsg.type === 'success' ? '✓' : '⚠️'}</span>
            <span>{advanceMsg.text}</span>
          </div>
        )}
      </div>

      {/* NEW: Pick Submission Summary (Cloud Status Audit) */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-black text-sm text-slate-800 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            Live Pick Submission Status
          </h3>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Cloud Audit View
          </span>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {players.filter(p => p.isActive).map(player => {
            const playerPicks = picks[player.name];
            const pickCount = Object.keys(playerPicks?.picks || {}).length;
            const hasTiebreaker = playerPicks?.tiebreaker !== undefined && playerPicks?.tiebreaker !== '';
            const isComplete = pickCount >= 16 && hasTiebreaker;
            
            return (
              <div 
                key={player.id} 
                className={`p-3 rounded-xl border-2 transition-all ${
                  isComplete 
                    ? 'bg-emerald-50 border-emerald-200' 
                    : pickCount > 0 
                      ? 'bg-amber-50 border-amber-200' 
                      : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs truncate max-w-[80px]">{player.name}</span>
                  {isComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : pickCount > 0 ? (
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">Picks:</span>
                    <span className={`font-bold ${pickCount >= 16 ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {pickCount}/16
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">Tiebr:</span>
                    <span className={`font-bold ${hasTiebreaker ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {hasTiebreaker ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top High-Contrast Segmented Navigation Bar */}
      <div className="bg-white p-2 rounded-2xl border-2 border-slate-300 shadow-sm flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setActiveSection('games')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border-2 ${
            activeSection === 'games'
              ? 'bg-[#1b3a2b] text-white border-emerald-950 shadow-sm'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
          }`}
        >
          <Trophy className={`w-4 h-4 ${activeSection === 'games' ? 'text-amber-300' : 'text-emerald-700'}`} />
          <span>Game Scores & Winners</span>
          <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
            activeSection === 'games' ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-200 text-slate-700'
          }`}>
            {decidedCount}/{games.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('overrides')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border-2 ${
            activeSection === 'overrides'
              ? 'bg-purple-900 text-white border-purple-950 shadow-sm'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
          }`}
        >
          <Edit3 className={`w-4 h-4 ${activeSection === 'overrides' ? 'text-amber-300' : 'text-purple-700'}`} />
          <span>Senior Pick Overrider</span>
        </button>

        <button
          onClick={() => setActiveSection('dispatches')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border-2 ${
            activeSection === 'dispatches'
              ? 'bg-emerald-900 text-white border-emerald-950 shadow-sm'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
          }`}
        >
          <Newspaper className={`w-4 h-4 ${activeSection === 'dispatches' ? 'text-amber-300' : 'text-emerald-700'}`} />
          <span>Weekly Dispatches</span>
          <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
            activeSection === 'dispatches' ? 'bg-emerald-800 text-emerald-200' : 'bg-slate-200 text-slate-700'
          }`}>
            {dispatches.length}/{activeDispatchSlots.length} Ready
          </span>
        </button>

        <button
          onClick={() => setActiveSection('roster')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border-2 ${
            activeSection === 'roster'
              ? 'bg-slate-800 text-white border-slate-950 shadow-sm'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
          }`}
        >
          <Users className={`w-4 h-4 ${activeSection === 'roster' ? 'text-amber-300' : 'text-slate-600'}`} />
          <span>Contender Roster ({players.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer border-2 ${
            activeSection === 'audit'
              ? 'bg-amber-600 text-white border-amber-800 shadow-sm'
              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
          }`}
        >
          <ShieldCheck className={`w-4 h-4 ${activeSection === 'audit' ? 'text-amber-100' : 'text-amber-600'}`} />
          <span>Audit & Historical Data</span>
          {missingPlayers.length > 0 && (
            <span className="bg-amber-200 text-amber-950 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {missingPlayers.length} missing
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSection('all')}
          className={`hidden lg:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-2 ml-auto ${
            activeSection === 'all'
              ? 'bg-slate-900 text-white border-slate-950'
              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Show All Sections</span>
        </button>
      </div>

      {/* SECTION 1: GAME SCORES & OFFICIAL WINNERS */}
      {(activeSection === 'games' || activeSection === 'all') && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-slate-300 shadow-sm space-y-5">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b-2 border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Official Game Results & Scores</span>
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Click a team to mark them as the official winner, or type exact scores. Standings recalculate immediately.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-300 text-xs font-bold">
              <button
                onClick={() => setGameFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  gameFilter === 'all' ? 'bg-[#1b3a2b] text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                All (16)
              </button>
              <button
                onClick={() => setGameFilter('final')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  gameFilter === 'final' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Final ({decidedCount})
              </button>
              <button
                onClick={() => setGameFilter('live')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  gameFilter === 'live' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Live ({games.filter(g => g.status === 'in_progress').length})
              </button>
              <button
                onClick={() => setGameFilter('scheduled')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  gameFilter === 'scheduled' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Scheduled ({games.filter(g => g.status === 'scheduled').length})
              </button>
            </div>
          </div>

          {/* Live Sync Action Banner */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-300 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>Live Scoreboard Feed (ESPN NFL Sync & Cross-Tab Broadcast)</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  {lastScoreSyncTime ? `Last sync completed at ${lastScoreSyncTime}` : 'Ready to pull live game quarters & scores'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onSyncLiveScores && (
                <button
                  type="button"
                  onClick={onSyncLiveScores}
                  disabled={isSyncingScores}
                  className="flex items-center gap-1.5 bg-[#1b3a2b] hover:bg-[#142d21] disabled:opacity-50 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xs cursor-pointer active:scale-95 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-amber-300 ${isSyncingScores ? 'animate-spin' : ''}`} />
                  <span>{isSyncingScores ? 'Syncing NFL...' : 'Sync Live Scores Now'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Game Cards Grid - High Contrast & Outlined */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 contain-list" style={{ contain: 'content' }}>
            {filteredGames.map(game => {
              const isFinal = game.status === 'final';
              const isLive = game.status === 'in_progress';
              const currentAwayScore = gameScoresInput[game.gameNumber]?.away ?? '';
              const currentHomeScore = gameScoresInput[game.gameNumber]?.home ?? '';

              return (
                <div 
                  key={game.gameNumber}
                  className={`rounded-xl border-2 transition-all p-4 ${
                    isFinal 
                      ? 'border-emerald-500 bg-emerald-50/20 shadow-xs' 
                      : isLive 
                        ? 'border-amber-400 bg-amber-50/25 shadow-xs' 
                        : 'border-slate-300 bg-white hover:border-slate-400 shadow-xs'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs px-2.5 py-1 rounded-md bg-slate-900 text-white tracking-wide">
                        Game {game.gameNumber}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        {game.day} • {game.kickoffTime}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isFinal ? (
                        <span className="text-[11px] font-black bg-emerald-200 text-emerald-950 border border-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          FINAL
                        </span>
                      ) : isLive ? (
                        <span className="text-[11px] font-black bg-amber-200 text-amber-950 border border-amber-400 px-2 py-0.5 rounded-full animate-pulse">
                          ⚡ LIVE
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                          SCHEDULED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* High Contrast Matchup Buttons */}
                  <div className="space-y-2 mb-3.5">
                    {/* Away Team Row */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const awayVal = currentAwayScore !== '' ? Number(currentAwayScore) : 24;
                          const homeVal = currentHomeScore !== '' ? Number(currentHomeScore) : 17;
                          onUpdateGameStatus(game.gameNumber, game.awayTeam, awayVal, homeVal, 'final');
                        }}
                        className={`flex-1 py-2 px-3 rounded-xl font-black text-left flex items-center justify-between border-2 transition-all cursor-pointer ${
                          game.officialWinner === game.awayTeam
                            ? 'bg-[#1b3a2b] text-white border-emerald-950 ring-2 ring-emerald-400 shadow-xs'
                            : 'bg-white text-slate-900 border-slate-300 hover:border-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-xs sm:text-sm">{game.awayTeam} (Away)</span>
                        {game.officialWinner === game.awayTeam && (
                          <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded uppercase">
                            ✓ Winner
                          </span>
                        )}
                      </button>

                      {/* Away Score Input */}
                      <div className="w-18 shrink-0">
                        <input
                          type="number"
                          value={currentAwayScore}
                          onChange={(e) => handleScoreInputChange(game.gameNumber, 'away', e.target.value)}
                          placeholder="Score"
                          className="w-full bg-white border-2 border-slate-300 focus:border-emerald-700 rounded-xl px-2 py-2 text-center text-xs font-mono font-black text-slate-900"
                          title="Away Score"
                        />
                      </div>
                    </div>

                    {/* Home Team Row */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const awayVal = currentAwayScore !== '' ? Number(currentAwayScore) : 17;
                          const homeVal = currentHomeScore !== '' ? Number(currentHomeScore) : 24;
                          onUpdateGameStatus(game.gameNumber, game.homeTeam, awayVal, homeVal, 'final');
                        }}
                        className={`flex-1 py-2 px-3 rounded-xl font-black text-left flex items-center justify-between border-2 transition-all cursor-pointer ${
                          game.officialWinner === game.homeTeam
                            ? 'bg-[#1b3a2b] text-white border-emerald-950 ring-2 ring-emerald-400 shadow-xs'
                            : 'bg-white text-slate-900 border-slate-300 hover:border-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-xs sm:text-sm">{game.homeTeam} (Home)</span>
                        {game.officialWinner === game.homeTeam && (
                          <span className="text-[10px] bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded uppercase">
                            ✓ Winner
                          </span>
                        )}
                      </button>

                      {/* Home Score Input */}
                      <div className="w-18 shrink-0">
                        <input
                          type="number"
                          value={currentHomeScore}
                          onChange={(e) => handleScoreInputChange(game.gameNumber, 'home', e.target.value)}
                          placeholder="Score"
                          className="w-full bg-white border-2 border-slate-300 focus:border-emerald-700 rounded-xl px-2 py-2 text-center text-xs font-mono font-black text-slate-900"
                          title="Home Score"
                        />
                      </div>
                    </div>
                  </div>

                    {/* Tie Game & Actions Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const awayVal = currentAwayScore !== '' ? Number(currentAwayScore) : 20;
                          const homeVal = currentHomeScore !== '' ? Number(currentHomeScore) : 20;
                          onUpdateGameStatus(game.gameNumber, 'TIE', awayVal, homeVal, 'final');
                        }}
                        className={`py-1 px-2.5 rounded-lg font-bold text-xs flex items-center gap-1 border transition-all cursor-pointer ${
                          game.officialWinner === 'TIE' || game.isTie
                            ? 'bg-sky-100 text-sky-950 border-sky-400 ring-2 ring-sky-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-sky-50 hover:text-sky-900'
                        }`}
                        title="Mark game as official NFL Tie (Push)"
                      >
                        <span>⚖️</span>
                        <span>{game.officialWinner === 'TIE' || game.isTie ? '✓ Official Tie' : 'Mark Tie'}</span>
                      </button>

                      {game.officialWinner && (
                        <button
                          type="button"
                          onClick={() => onUpdateGameStatus(game.gameNumber, null, undefined, undefined, 'scheduled')}
                          className="text-rose-700 hover:text-rose-900 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                          title="Reset game to scheduled state"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reset Game</span>
                        </button>
                      )}
                    </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: SENIOR MEMBER PICK OVERRIDER */}
      {(activeSection === 'overrides' || activeSection === 'all') && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-purple-300 shadow-sm space-y-5">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-4 border-b-2 border-purple-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-600"></span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-purple-700" />
                  <span>Admin Pick Overrider (Senior Member Assistance)</span>
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                If a senior contender phones or texts you their picks, select their name, click their picks, and save.
              </p>
            </div>

            {/* Member Selector Bar */}
            <div className="flex items-center gap-2 w-full md:w-auto bg-purple-50 p-2 rounded-xl border-2 border-purple-300">
              <label className="text-xs font-black text-purple-950 uppercase tracking-wide shrink-0">
                Contender:
              </label>
              <select
                value={selectedContender}
                onChange={(e) => setSelectedContender(e.target.value)}
                className="bg-white border-2 border-purple-400 rounded-lg px-3 py-1.5 text-xs font-black text-slate-900 focus:outline-none focus:border-purple-700 cursor-pointer w-full md:w-48"
              >
                {players.map(p => (
                  <option key={p.id} value={p.name}>
                    {p.name} {p.isElvis ? '(The King)' : ''} {p.isDefendingChamp ? '🏆' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Helper Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-purple-50/70 rounded-xl border border-purple-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-black text-purple-950">Editing Picks for:</span>
              <span className="bg-purple-900 text-white font-black px-2.5 py-0.5 rounded-md">
                {selectedContender}
              </span>
              <span className="text-purple-800 font-semibold">
                ({Object.keys(editingPicks).length} of {games.length} picked)
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSyncElvisToBoard}
                disabled={isSyncingElvis}
                className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black border-2 border-amber-600 px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs shadow-2xs disabled:opacity-50"
                title="Generate & lock Elvis's Vegas Insider favorites onto the master board"
              >
                <span>{isSyncingElvis ? 'Syncing...' : '🕶️ Sync Elvis to Board'}</span>
              </button>

              <button
                type="button"
                onClick={handleFillVegasFavorites}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black border-2 border-amber-600 px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs shadow-2xs"
                title="Populate picks with Vegas favorites posted on Vegas Insider"
              >
                <span>🎰 Fill Vegas Favorites</span>
              </button>

              <button
                type="button"
                onClick={handleCopyElvisPicks}
                className="flex items-center gap-1.5 bg-white hover:bg-purple-100 text-purple-900 font-bold border-2 border-purple-300 px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs"
                title="Copy Elvis's official pool slate"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Copy Elvis's Slate</span>
              </button>
            </div>
          </div>

          {saveSuccessMsg && (
            <div className="bg-emerald-100 border-2 border-emerald-400 p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-black text-emerald-950 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* SECTION 2.5: GMAIL PICK RECOVERY ENGINE */}
          <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-200 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-emerald-700" />
                  <span className="font-black text-slate-900">Gmail Pick Recovery Engine</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Scan your inbox for picks sent via email from contenders.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGmailSync}
                disabled={isGmailScanning}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-black text-xs shadow-sm transition-all active:scale-95 ${
                  isGmailScanning 
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {isGmailScanning ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Scanning...</span>
                  </>
                ) : (
                  <>
                    <FileSearch className="w-3 h-3" />
                    <span>Scan Inbox for Picks</span>
                  </>
                )}
              </button>
            </div>

            {gmailError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-[11px] text-rose-800 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{gmailError}</span>
              </div>
            )}

            {gmailResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Found {gmailResults.length} Relevant Emails
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {gmailResults.map(result => (
                    <div 
                      key={result.id}
                      className="p-3 border border-slate-200 bg-white rounded-lg hover:border-emerald-400 transition-all cursor-default group"
                    >
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black text-emerald-900 truncate">{result.from}</div>
                          <div className="text-xs font-bold text-slate-900 truncate">{result.subject}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyGmailPicks(result)}
                          className="bg-emerald-600 text-white p-1 rounded-md shadow-sm hover:bg-emerald-700 transition-colors shrink-0"
                          title="Import these picks"
                        >
                          <Zap className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-2 italic">
                        "{result.snippet}"
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="text-[9px] bg-emerald-100 text-emerald-900 font-black px-1.5 py-0.5 rounded border border-emerald-200">
                          {Object.keys(result.parsedPicks).length} Picks Detected
                        </span>
                        {result.parsedTb && (
                          <span className="text-[9px] bg-purple-100 text-purple-900 font-black px-1.5 py-0.5 rounded border border-purple-200">
                            TB: {result.parsedTb}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2.6: VISION AI RECOVERY (Handwritten Sheets) */}
          <div className="bg-purple-50/50 rounded-xl p-4 border border-purple-200 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-purple-700" />
                  <span className="font-black text-slate-900">Vision AI Recovery (Handwritten Sheets)</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Upload a photo of a handwritten pick sheet or ledger. Gemini AI will attempt to digitize it.
                </p>
              </div>

              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleVisionSync}
                  className="hidden"
                  id="vision-upload"
                  disabled={isVisionParsing}
                />
                <label
                  htmlFor="vision-upload"
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-black text-xs shadow-sm transition-all active:scale-95 cursor-pointer ${
                    isVisionParsing 
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {isVisionParsing ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Parsing Image...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3 h-3 text-amber-300" />
                      <span>Scan Pick Sheet Photo</span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {visionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-[11px] text-rose-800 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{visionError}</span>
              </div>
            )}

            {visionImage && (
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-lg border-2 border-purple-200 overflow-hidden shrink-0 shadow-sm">
                  <img src={visionImage} alt="Uploaded sheet" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 py-1">
                  <div className="text-xs font-black text-purple-900 mb-1">Last Uploaded Image</div>
                  <div className="text-[10px] text-slate-500 italic leading-relaxed">
                    Gemini AI is processing this image to find team names and tiebreaker scores matching our Week 2 schedule.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 16 Games Pick Grid */}
          <form onSubmit={handleSaveAdminPicks}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {games.map(game => {
                const currentPick = editingPicks[game.gameNumber] || '';
                const isSelectedAway = currentPick === game.awayTeam;
                const isSelectedHome = currentPick === game.homeTeam;

                return (
                  <div 
                    key={game.gameNumber} 
                    className={`p-3 rounded-xl border-2 transition-all ${
                      currentPick 
                        ? 'border-purple-300 bg-white shadow-xs' 
                        : 'border-slate-300 bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-slate-800 text-xs mb-2 flex items-center justify-between pb-1.5 border-b border-slate-200">
                      <span className="font-black text-slate-900">Game {game.gameNumber}</span>
                      <span className="text-[10px] text-slate-500 font-semibold">{game.day.split(' ')[0]}</span>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAdminPickChange(game.gameNumber, game.awayTeam)}
                        className={`flex-1 py-2 px-1 rounded-lg font-black text-xs truncate transition-all cursor-pointer border-2 ${
                          isSelectedAway
                            ? 'bg-[#1b3a2b] text-white border-emerald-950 ring-2 ring-emerald-400'
                            : 'bg-white text-slate-800 border-slate-300 hover:border-purple-400'
                        }`}
                        title={game.awayTeam}
                      >
                        {game.awayTeam}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAdminPickChange(game.gameNumber, game.homeTeam)}
                        className={`flex-1 py-2 px-1 rounded-lg font-black text-xs truncate transition-all cursor-pointer border-2 ${
                          isSelectedHome
                            ? 'bg-[#1b3a2b] text-white border-emerald-950 ring-2 ring-emerald-400'
                            : 'bg-white text-slate-800 border-slate-300 hover:border-purple-400'
                        }`}
                        title={game.homeTeam}
                      >
                        {game.homeTeam}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* MNF Tiebreaker & Save Action Banner */}
            <div className="p-4 bg-gradient-to-r from-purple-100 to-indigo-50 rounded-2xl border-2 border-purple-400 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <label className="text-xs sm:text-sm font-black text-purple-950">
                  Monday Night Tiebreaker Score for {selectedContender}:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={editingTiebreaker}
                    onChange={(e) => setEditingTiebreaker(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-24 bg-white border-2 border-purple-500 focus:border-purple-700 rounded-xl px-3 py-1.5 text-base font-mono font-black text-purple-950 text-center"
                  />
                  <span className="text-xs font-bold text-purple-900">pts</span>
                </div>
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto bg-[#1b3a2b] hover:bg-emerald-900 text-white font-black text-sm px-6 py-3 rounded-xl shadow-md border-2 border-emerald-950 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <Save className="w-4 h-4 text-amber-300" />
                <span>Save All Picks for {selectedContender}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION: WEEKLY DISPATCH OPERATIONS DECK (ADMIN HUB)     */}
      {/* ======================================================== */}
      {(activeSection === 'dispatches' || activeSection === 'all') && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-slate-300 shadow-sm space-y-6">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b-2 border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Newspaper className="w-5 h-5 text-emerald-700" />
                  <span>Weekly Dispatch Operations & Command Deck</span>
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Centralized hub for generating automated dispatches, editing rich HTML, attaching podcasts, and broadcasting to all contenders.
              </p>
            </div>

            {/* Gmail Connection Status */}
            <div className="flex items-center gap-2 shrink-0">
              {isGmailConnected ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-emerald-950 font-medium">
                    Gmail: <strong>{gmailUserEmail}</strong>
                  </span>
                  <button
                    onClick={handleSignOutGmail}
                    className="text-[10px] text-emerald-800 hover:text-emerald-950 underline ml-1 cursor-pointer font-bold"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSignInGmail}
                  disabled={isAuthorizingGmail}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-950" />
                  <span>{isAuthorizingGmail ? 'Connecting...' : 'Connect Gmail for Dispatches'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Action Messages */}
          {dispatchActionSuccess && (
            <div className="p-3 bg-emerald-100 border-2 border-emerald-500 rounded-xl text-xs font-bold text-emerald-950 flex items-center gap-2 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{dispatchActionSuccess}</span>
            </div>
          )}

          {dispatchActionError && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-900 flex items-center gap-2 shadow-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{dispatchActionError}</span>
            </div>
          )}

          {/* SEQUENCED DISPATCH SLOTS */}
          <div className="space-y-2">
            <div className="text-xs font-black uppercase text-slate-600 tracking-wider">
              Select Dispatch Slot to Manage ({activeDispatchSlots.length} Configured {activeDispatchSlots.length === 1 ? 'Edition' : 'Editions'} Per Week)
            </div>
            <div className={`grid grid-cols-1 ${activeDispatchSlots.length === 1 ? 'md:grid-cols-1' : activeDispatchSlots.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-3`}>
              {activeDispatchSlots.map(s => {
                const matching = (dispatches || []).filter(d => d.type === s.id || d.id === `dispatch-${s.id}` || d.id?.startsWith(`dispatch-${s.id}-`));
                const slotDispatch = matching.sort((a, b) => (b.week || 0) - (a.week || 0))[0] || null;
                const hasDispatch = !!slotDispatch;
                const isSelected = activeSlot === s.id;

                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSlot(s.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-gradient-to-br from-emerald-950 to-[#064e3b] text-white border-emerald-900 shadow-md ring-2 ring-amber-400'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                          isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {s.tag}
                        </span>
                        <span className={`text-[11px] font-semibold flex items-center gap-1 ${
                          isSelected ? 'text-amber-200' : 'text-slate-500'
                        }`}>
                          <Clock className="w-3 h-3" />
                          <span>{s.schedule}</span>
                        </span>
                      </div>
                      <h4 className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {s.label}
                      </h4>
                      <p className={`text-xs mt-0.5 line-clamp-1 ${isSelected ? 'text-emerald-100/90' : 'text-slate-500'}`}>
                        {s.desc}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                      <span className={`flex items-center gap-1.5 font-bold ${
                        hasDispatch 
                          ? (isSelected ? 'text-amber-300' : 'text-emerald-700') 
                          : (isSelected ? 'text-emerald-300/70' : 'text-slate-400')
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${hasDispatch ? 'bg-emerald-400' : 'bg-slate-300'}`}></span>
                        <span>{hasDispatch ? 'Digital Sheet Ready' : 'Empty Slot'}</span>
                      </span>
                      <span className={`text-[10px] font-semibold ${isSelected ? 'text-amber-200' : 'text-slate-500'}`}>
                        {isSelected ? 'Active Slot ★' : 'Click to Manage'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ACTIVE SLOT OPERATIONS TOOLBAR */}
          <div className="bg-amber-50/80 border-2 border-amber-300 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <h4 className="font-black text-sm text-amber-950 uppercase tracking-wide">
                    Slot Operations • {activeSlot === 'friday' ? 'Friday Night Wire' : activeSlot === 'sunday' ? 'Sunday Night Recap' : 'Tuesday Final'}
                  </h4>
                </div>
                <p className="text-xs text-amber-900/80 mt-0.5">
                  Generate automated broadsheets, upload custom PDFs, edit rich content, or broadcast to contenders.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Generate Button */}
                <button
                  onClick={handleGenerateVibrantDispatch}
                  disabled={isGeneratingDispatch}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-800 to-emerald-950 text-white rounded-xl text-xs font-black hover:from-emerald-700 hover:to-emerald-900 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  title="Generate automated dispatch with live scores, archives quote and scraping"
                >
                  {isGeneratingDispatch ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span>{isGeneratingDispatch ? 'Compiling...' : '⚡ Generate Dispatch'}</span>
                </button>

                {/* Shuffle / Rewrite Button */}
                <button
                  onClick={handleShuffleVibrantDispatch}
                  disabled={isGeneratingDispatch}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 rounded-xl text-xs font-black hover:from-amber-400 hover:to-amber-500 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  title="Rewrite this dispatch with a brand-new original Gemini AI take, sports banter, and live game facts"
                >
                  {isGeneratingDispatch ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                  ) : (
                    <Shuffle className="w-3.5 h-3.5 text-slate-950" />
                  )}
                  <span>{isGeneratingDispatch ? 'Rewriting...' : '🎲 Shuffle & Rewrite'}</span>
                </button>

                {activeSlot === 'sunday' && (
                  <button
                    onClick={handleTriggerSundayPipeline}
                    disabled={isGeneratingDispatch}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-800 to-indigo-900 text-white rounded-xl text-xs font-black hover:from-purple-700 hover:to-indigo-800 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    title="Execute full synchronized sequence: SNF End -> Standings to Storage & Cloud -> Scraped Content -> Draft to Gmail"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    <span>{isGeneratingDispatch ? 'Running Sequence...' : '⚡ Sunday Master Pipeline'}</span>
                  </button>
                )}

                {activeSlot === 'tuesday' && (
                  <button
                    onClick={handleTriggerTuesdayPipeline}
                    disabled={isGeneratingDispatch || isAdvancingWeek}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-amber-700 text-slate-950 font-black rounded-xl text-xs hover:from-amber-400 hover:to-amber-600 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    title="Execute full synchronized sequence: Ingest Scores -> Crown Winner -> Freeze to Vault -> Tuesday Dispatch -> Pick Sheets Reset -> Week Rollover"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-950" />
                    <span>{isGeneratingDispatch || isAdvancingWeek ? 'Running Tuesday Cycle...' : '⚡ Tuesday Master Pipeline (Freeze, Dispatch & Rollover)'}</span>
                  </button>
                )}

                {/* Upload Button */}
                <label className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-slate-800 border border-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-xs cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span>Upload PDF / Scan</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleUploadDispatchDocument}
                    className="hidden"
                  />
                </label>

                {/* Edit Button */}
                {currentSlotDispatch && (
                  <button
                    onClick={() => {
                      setEditSubject(currentSlotDispatch.subject || currentSlotDispatch.title);
                      setEditPreheader(currentSlotDispatch.preheader || currentSlotDispatch.subtitle || '');
                      setEditedHtml(currentSlotDispatch.body_html || currentSlotDispatch.content);
                      setEditQuote(currentSlotDispatch.consultantQuote || '');
                      setIsEditingHtml(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-800 border border-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
                    title="Edit rich HTML, title and Crew Chief banter directly"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                    <span>Edit Rich Content</span>
                  </button>
                )}

                {/* Podcast Button */}
                {currentSlotDispatch && (
                  <button
                    onClick={() => {
                      setPodcastUrlInput(currentSlotDispatch.podcastUrl || '');
                      setPodcastTitleInput(currentSlotDispatch.podcastTitle || `${currentSlotDispatch.title} • 5-Minute Review`);
                      setIsEditingPodcast(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer"
                    title="Attach or edit 5-minute podcast review link"
                  >
                    <Headphones className="w-3.5 h-3.5 text-slate-950" />
                    <span>{currentSlotDispatch.podcastUrl ? '🎙️ Edit Pod' : '🎙️ Attach Pod'}</span>
                  </button>
                )}

                {/* Remove Button */}
                {currentSlotDispatch && (
                  <button
                    onClick={handleRemoveDispatch}
                    disabled={isDeletingDispatch}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    title="Physically remove this dispatch from public view"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                    <span>{isDeletingDispatch ? 'Removing...' : 'Remove'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Distribution Broadcast Bar */}
            {currentSlotDispatch && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-medium">
                  <Send className="w-3.5 h-3.5 text-emerald-800" />
                  <span>
                    Email Broadcast to <strong>{players.filter(p => p.isActive !== false && !p.isElvis).length} active contenders</strong>:
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {currentSlotDispatch.draftId && (
                    <a
                      href={currentSlotDispatch.draftUrl || 'https://mail.google.com/mail/u/0/#drafts'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg text-[11px] font-bold hover:bg-emerald-200 transition-all shadow-2xs"
                      title="Open draft in Gmail Drafts folder"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                      <span>Draft in Gmail</span>
                    </a>
                  )}
                  <button
                    onClick={() => handleDraftDispatch(currentSlotDispatch)}
                    disabled={draftingDispatchId === currentSlotDispatch.id}
                    className="flex items-center gap-1 px-3.5 py-1.5 bg-amber-200/90 hover:bg-amber-300 text-amber-950 rounded-xl font-bold transition-all cursor-pointer shadow-2xs"
                  >
                    <Mail className="w-3.5 h-3.5 text-amber-800" />
                    <span>{draftingDispatchId === currentSlotDispatch.id ? 'Drafting...' : 'Gmail Draft'}</span>
                  </button>
                  <button
                    onClick={() => handleSendDispatch(currentSlotDispatch)}
                    disabled={sendingDispatchId === currentSlotDispatch.id}
                    className="flex items-center gap-1 px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-emerald-300" />
                    <span>{sendingDispatchId === currentSlotDispatch.id ? 'Sending...' : 'Send to Contenders'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* LIVE BROADSHEET PREVIEW */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-700" />
                <span>Live Broadsheet Preview • {currentSlotDispatch?.title || 'No dispatch published'}</span>
              </span>
              {currentSlotDispatch && (
                <span className="text-[11px] text-slate-500">
                  Published: {currentSlotDispatch.timestamp || 'Ready'}
                </span>
              )}
            </div>

            <div className="border-2 border-slate-300 rounded-2xl bg-slate-100 p-4 max-h-[500px] overflow-y-auto">
              {currentSlotDispatch ? (
                currentSlotDispatch.isPdfUpload && currentSlotDispatch.pdfUrl ? (
                  <div className="bg-white p-6 rounded-xl border border-slate-200 text-center">
                    <p className="font-bold text-slate-800 text-sm">Custom 8.5" × 11" PDF BroadSheet Staged</p>
                    <p className="text-xs text-slate-500 mt-1">Contenders view this rendered natively in the Dispatches broadsheet viewer.</p>
                  </div>
                ) : (
                  <div 
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs prose max-w-none"
                    dangerouslySetInnerHTML={{ __html: currentSlotDispatch.body_html || currentSlotDispatch.content }}
                  />
                )
              ) : (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <p className="font-bold text-sm">This dispatch slot is currently empty.</p>
                  <p className="text-xs">Click <strong>"⚡ Generate Vibrant Dispatch"</strong> above to compile the broadsheet automatically.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: CONTENDER ROSTER & DIRECTORY */}
      {(activeSection === 'roster' || activeSection === 'all') && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-slate-300 shadow-sm space-y-5">
          {/* Section Header & Search */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b-2 border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-700"></span>
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Users className="w-5 h-5 text-slate-700" />
                  <span>Pool Roster & Contact Directory ({players.length} Members)</span>
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Update member email addresses and contact information so Friday dispatches reach everyone.
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-300">
              <button
                type="button"
                onClick={() => setRosterStatusFilter('all')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                  rosterStatusFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({players.length})
              </button>
              <button
                type="button"
                onClick={() => setRosterStatusFilter('active')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                  rosterStatusFilter === 'active'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active ({activeRosterCount})
              </button>
              <button
                type="button"
                onClick={() => setRosterStatusFilter('inactive')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                  rosterStatusFilter === 'inactive'
                    ? 'bg-rose-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inactive ({inactiveRosterCount})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border-2 border-slate-300 rounded-xl focus:outline-none focus:border-slate-700 font-semibold text-slate-900"
              />
            </div>

            {onRepairRoster && (
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm('This will reconcile the active pool roster and synchronize all contenders across devices. Proceed?')) {
                    const res = await onRepairRoster();
                    if (res.success) {
                      setRosterUpdateMsg('Roster repaired and synchronized globally!');
                    }
                  }
                }}
                className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-black text-xs px-3.5 py-2 rounded-xl border-2 border-emerald-300 shadow-2xs cursor-pointer active:scale-95 transition-all"
                title="Reconcile active roster and synchronize across devices"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Repair & Sync Roster</span>
              </button>
            )}
          </div>

          {/* Add New Contender Anytime (Mid-Week or Mid-Season Onboarding) */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const cleanName = newContenderName.trim();
              if (!cleanName) return;
              if (players.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
                setRosterUpdateMsg(`Contender "${cleanName}" is already on the roster.`);
                setSafeTimeout(() => setRosterUpdateMsg(null), 4000);
                return;
              }
              setIsAddingContender(true);
              try {
                if (onAddContender) {
                  await onAddContender(cleanName, newContenderEmail.trim(), newContenderPhone.trim() || undefined);
                }
                setNewContenderName('');
                setNewContenderEmail('');
                setNewContenderPhone('');
                setRosterUpdateMsg(`Added "${cleanName}" to the active pool roster with a fresh pick sheet!`);
                setSafeTimeout(() => setRosterUpdateMsg(null), 4000);
              } finally {
                setIsAddingContender(false);
              }
            }}
            className="bg-emerald-50/70 border-2 border-emerald-300 rounded-xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5"
          >
            <div className="flex-1">
              <label className="block text-[11px] font-black text-emerald-950 uppercase tracking-wide mb-1">
                + Add Contender Anytime (Name)
              </label>
              <input
                type="text"
                required
                value={newContenderName}
                onChange={(e) => setNewContenderName(e.target.value)}
                placeholder="e.g. Coach Dave"
                className="w-full px-3 py-2 text-xs bg-white border-2 border-emerald-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Email Address (for Dispatches)
              </label>
              <input
                type="email"
                value={newContenderEmail}
                onChange={(e) => setNewContenderEmail(e.target.value)}
                placeholder="dave@example.org"
                className="w-full px-3 py-2 text-xs bg-white border-2 border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div className="sm:w-44">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Phone (Optional)
              </label>
              <input
                type="text"
                value={newContenderPhone}
                onChange={(e) => setNewContenderPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full px-3 py-2 text-xs bg-white border-2 border-slate-300 rounded-xl font-medium text-slate-900 focus:outline-none focus:border-emerald-700"
              />
            </div>
            <button
              type="submit"
              disabled={isAddingContender || !newContenderName.trim()}
              className="px-4 py-2 bg-[#1b3a2b] hover:bg-emerald-900 disabled:opacity-50 text-amber-300 font-black text-xs rounded-xl border-2 border-emerald-950 cursor-pointer shrink-0 transition-all"
            >
              {isAddingContender ? 'Adding...' : '+ Add Contender'}
            </button>
          </form>

          {rosterUpdateMsg && (
            <div className="bg-emerald-100 border-2 border-emerald-400 p-3 rounded-xl flex items-center gap-2 text-xs font-black text-emerald-950">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>{rosterUpdateMsg}</span>
            </div>
          )}

          {/* Table with High Contrast Outlines */}
          <div className="overflow-x-auto rounded-xl border-2 border-slate-300 contain-content" style={{ contain: 'content' }}>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-black border-b-2 border-slate-800">
                  <th className="px-4 py-3">Contender Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Email Address</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3 text-right">Quick Contact & Edit</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player, idx) => (
                  <tr 
                    key={player.id} 
                    className={`border-b border-slate-200 hover:bg-slate-100/80 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                    }`}
                  >
                    <td className="px-4 py-3 font-black text-slate-900 text-xs sm:text-sm">
                      <div className="flex items-center gap-1.5">
                        {player.isElvis && <span>🕶️</span>}
                        {player.isDefendingChamp && <span>🏆</span>}
                        <span>{player.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {player.role === 'admin' && (
                        <span className="bg-slate-200 text-slate-900 border border-slate-400 px-2 py-0.5 rounded-md font-black">
                          The Admin
                        </span>
                      )}
                      {player.role === 'consultant' && (
                        <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-md font-black">
                          The Consultant
                        </span>
                      )}
                      {player.isDefendingChamp && (
                        <span className="bg-amber-200 text-amber-950 border border-amber-400 px-2 py-0.5 rounded-md font-black">
                          Defending Champ
                        </span>
                      )}
                      {player.isElvis && (
                        <span className="bg-purple-200 text-purple-950 border border-purple-300 px-2 py-0.5 rounded-md font-black">
                          The King
                        </span>
                      )}
                      {player.role === 'player' && !player.isDefendingChamp && (
                        <span className="text-slate-600 font-bold">Contender</span>
                      )}
                      {player.isActive === false && (
                        <span className="ml-1.5 bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          Inactive (Hidden)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">
                      {player.email}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {player.phone || <span className="text-slate-400 italic">Not set</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditPlayer(player)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-2.5 py-1 rounded-lg border border-slate-300 cursor-pointer text-xs"
                        >
                          Edit
                        </button>
                        {!player.isElvis && (
                          <a
                            href={`mailto:${player.email}`}
                            className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold px-2.5 py-1 rounded-lg border border-emerald-300 flex items-center gap-1 cursor-pointer text-xs"
                          >
                            <Mail className="w-3 h-3" />
                            <span>Email</span>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit Player Modal */}
          {editingPlayer && (
            <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4" style={{ contain: 'strict' }}>
              <div className="bg-white rounded-2xl border-2 border-slate-400 shadow-xl max-w-md w-full p-6 space-y-4 contain-modal" style={{ contain: 'layout paint' }}>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <h4 className="text-base font-black text-slate-900">
                    Edit Contact: {editingPlayer.name}
                  </h4>
                  <button
                    onClick={() => setEditingPlayer(null)}
                    className="text-slate-400 hover:text-slate-600 font-black text-sm"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSavePlayerContact} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email Address:
                    </label>
                    <input
                      type="email"
                      required
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Phone Number (Optional):
                    </label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. (408) 555-1234"
                      className="w-full bg-slate-50 border-2 border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-700"
                    />
                  </div>

                  <div className="p-3 bg-slate-50 border-2 border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Pool Participation Status:</span>
                      <span className="text-[11px] text-slate-500">
                        {editIsActive ? 'Active in weekly sheet & standings' : 'Inactive (Hidden from active sheet & standings)'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditIsActive(!editIsActive)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                        editIsActive
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                          : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                      }`}
                    >
                      {editIsActive ? '✓ Active' : '✕ Inactive (Out)'}
                    </button>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setEditingPlayer(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-emerald-800 hover:bg-emerald-900 text-white font-black text-xs px-4 py-2 rounded-xl border-2 border-emerald-950 cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: AUDIT & HISTORICAL DATA */}
      {(activeSection === 'audit' || activeSection === 'all') && (
        <WeeklyAuditSection
          seasonHistory={seasonHistory}
          players={players}
          games={games}
          picks={picks}
          onUpdateHistoricalWeekRecord={onUpdateHistoricalWeekRecord}
          onToggleFreezeWeek={onToggleFreezeWeek}
          onResetSeasonHistory={onResetSeasonHistory}
          onCompileWeekResults={onCompileWeekResults}
          onAdvanceWeekSafely={onAdvanceWeekSafely || advanceWeekSafely}
          onNavigateToOverrides={(name) => {
            setSelectedContender(name);
            setActiveSection('overrides');
          }}
        />
      )}

      {/* Standardized Operational Checks Modal */}
      <OperationalCheckModal
        isOpen={isVerificationModalOpen}
        onClose={() => setIsVerificationModalOpen(false)}
        isRunning={isRunningChecks}
        results={verificationResults}
        onRerun={handleRunOperationalChecks}
      />

      {/* RICH CONTENT EDIT MODAL */}
      {isEditingHtml && currentSlotDispatch && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl border-2 border-slate-400 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-[#064e3b] text-white p-4 flex items-center justify-between border-b-2 border-emerald-700">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-300" />
                <h3 className="font-black text-base uppercase tracking-wide">
                  Edit Dispatch Rich Content • {currentSlotDispatch.title}
                </h3>
              </div>
              <button
                onClick={() => setIsEditingHtml(false)}
                className="text-emerald-200 hover:text-white font-bold text-lg cursor-pointer px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email Subject</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={e => setEditSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Preheader Summary</label>
                <input
                  type="text"
                  value={editPreheader}
                  onChange={e => setEditPreheader(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Umpire Quote</label>
                <input
                  type="text"
                  value={editQuote}
                  onChange={e => setEditQuote(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Dispatch Body HTML</label>
                <textarea
                  value={editedHtml}
                  onChange={e => setEditedHtml(e.target.value)}
                  rows={14}
                  className="w-full p-3 font-mono text-xs border border-slate-300 rounded-lg bg-slate-50 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-300 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsEditingHtml(false)}
                className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedHtml}
                className="px-5 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm cursor-pointer"
              >
                Save & Publish Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PODCAST EDIT MODAL */}
      {isEditingPodcast && currentSlotDispatch && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-2xl border-2 border-slate-400 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-[#022c22] text-white p-4 flex items-center justify-between border-b-2 border-amber-400">
              <div className="flex items-center gap-2">
                <Headphones className="w-5 h-5 text-amber-300" />
                <h3 className="font-black text-sm uppercase tracking-wide">
                  🎙️ Attach 5-Min Podcast Review
                </h3>
              </div>
              <button
                onClick={() => setIsEditingPodcast(false)}
                className="text-amber-200 hover:text-white font-bold text-lg cursor-pointer px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Podcast Episode Title</label>
                <input
                  type="text"
                  value={podcastTitleInput}
                  onChange={e => setPodcastTitleInput(e.target.value)}
                  placeholder="Week 3 BroadSheet Breakdown • 5-Min Review"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Audio / Stream URL</label>
                <input
                  type="url"
                  value={podcastUrlInput}
                  onChange={e => setPodcastUrlInput(e.target.value)}
                  placeholder="https://example.com/podcast/week-review.mp3"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-300 flex items-center justify-end gap-2">
              <button
                onClick={() => setIsEditingPodcast(false)}
                className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePodcast}
                className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shadow-sm cursor-pointer"
              >
                Save Podcast Link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

