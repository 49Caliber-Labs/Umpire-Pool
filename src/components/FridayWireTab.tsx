import React, { useState, memo, useMemo, useEffect } from 'react';
import { 
  Newspaper, 
  Copy, 
  Check, 
  Clock, 
  Headphones, 
  Download,
  AlertTriangle,
  CloudSun,
  Mail,
  Shuffle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { useSafeTimeout } from '../utils/performanceUtils';
import { Game, Player, PlayerPickData, WeeklyDispatch, SeasonHistory } from '../types';
import { generateDispatchDocx } from '../utils/docxExporter';
import { generateDispatchPDF } from '../utils/pdfGenerator';
import { signInWithGoogle, createGmailDraft, getCachedAccessToken } from '../services/gmailService';
import { publishDispatchGlobally } from '../services/poolSyncService';
import { evaluateLeaguePulse } from '../services/leagueClockService';
import { PoolSetupConfig, DEFAULT_POOL_CONFIG } from '../config/leagueConfig';

interface FridayWireTabProps {
  dispatches: WeeklyDispatch[];
  games: Game[];
  players: Player[];
  picks: Record<string, PlayerPickData>;
  currentWeek?: number;
  activePlayer?: Player | null;
  seasonHistory?: SeasonHistory;
  onNavigateToAdmin?: () => void;
  onPublishDispatch?: (dispatch: WeeklyDispatch) => Promise<void> | void;
  poolConfig?: PoolSetupConfig;
}

// Dynamic loader for PDF.js to render multi-page PDFs as crisp native canvases
let pdfjsLibPromise: Promise<any> | null = null;
const loadPdfJsLib = (): Promise<any> => {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if ((window as any).pdfjsLib) return Promise.resolve((window as any).pdfjsLib);
  if (pdfjsLibPromise) return pdfjsLibPromise;

  pdfjsLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(lib);
      } else {
        reject(new Error('pdfjsLib not found on window'));
      }
    };
    script.onerror = () => {
      pdfjsLibPromise = null;
      reject(new Error('Failed to load PDF.js from CDN'));
    };
    document.head.appendChild(script);
  });

  return pdfjsLibPromise;
};

// Convert a base64 dataUrl or binary into an array of page image data URLs
const renderPdfPagesToImages = async (pdfUrl: string): Promise<string[]> => {
  const pdfjs = await loadPdfJsLib();
  
  let data: Uint8Array;
  if (pdfUrl.startsWith('data:')) {
    const base64 = pdfUrl.split(',')[1] || '';
    const binary = atob(base64);
    data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      data[i] = binary.charCodeAt(i);
    }
  } else {
    const res = await fetch(pdfUrl);
    const buf = await res.arrayBuffer();
    data = new Uint8Array(buf);
  }

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pageImages: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport }).promise;
      pageImages.push(canvas.toDataURL('image/png'));
    }
  }

  return pageImages;
};

interface MultiPagePdfViewerProps {
  pdfUrl: string;
  title: string;
  zoomLevel: 'fit' | '100' | '125';
}

const MultiPagePdfViewer: React.FC<MultiPagePdfViewerProps> = ({ pdfUrl, title }) => {
  const [pages, setPages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  React.useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setRenderError(null);

    renderPdfPagesToImages(pdfUrl)
      .then(renderedPages => {
        if (!isCancelled) {
          setPages(renderedPages);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!isCancelled) {
          console.error('[MultiPagePdfViewer] PDF.js rendering error:', err);
          setRenderError(err.message || 'Failed to render PDF canvas');
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [pdfUrl]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-800 border-t-amber-400 rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-slate-700">Rendering BroadSheet PDF Pages...</p>
      </div>
    );
  }

  if (renderError || pages.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-300 text-center space-y-3">
        <p className="text-xs text-slate-600">Standard PDF presentation fallback</p>
        <iframe
          src={pdfUrl}
          title={title}
          className="w-full h-[800px] rounded-lg border border-slate-200"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pages.map((imgSrc, idx) => (
        <div 
          key={idx} 
          className="bg-white p-3 sm:p-5 rounded-2xl border-2 border-slate-300 shadow-md relative group transition-all"
        >
          <div className="absolute top-3 right-3 bg-slate-900/80 text-white text-[10px] font-mono px-2 py-0.5 rounded-md backdrop-blur-xs">
            Page {idx + 1} of {pages.length}
          </div>
          <img
            src={imgSrc}
            alt={`${title} - Page ${idx + 1}`}
            className="w-full h-auto rounded-lg shadow-xs object-contain mx-auto"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
};

export const FridayWireTab: React.FC<FridayWireTabProps> = memo(({
  dispatches = [],
  games,
  players,
  picks,
  currentWeek = 3,
  activePlayer,
  seasonHistory,
  onNavigateToAdmin,
  onPublishDispatch,
  poolConfig = DEFAULT_POOL_CONFIG
}) => {
  const { setSafeTimeout } = useSafeTimeout();
  const cadence = poolConfig.dispatchCadence || 1;

  // Sequenced Slots: 'friday' | 'sunday' | 'tuesday'
  // Auto-chaser: Intelligently flags the latest active dispatch as the default view on refresh/load
  const [activeSlot, setActiveSlot] = useState<'friday' | 'sunday' | 'tuesday'>(() => {
    try {
      if (cadence === 1) return 'tuesday';
      const now = new Date();
      const pstDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(now);
      if (pstDay === 'Tue' || pstDay === 'Wed' || pstDay === 'Thu') return 'tuesday';
      if (pstDay === 'Fri' || pstDay === 'Sat') return cadence === 2 ? 'sunday' : 'friday';
      return 'sunday';
    } catch (e) {
      return 'tuesday';
    }
  });

  // Chaser hook: Sets the newest cycle dispatch as default display whenever dispatches load or update
  useEffect(() => {
    try {
      if (cadence === 1) {
        setActiveSlot('tuesday');
        return;
      }
      const pulse = evaluateLeaguePulse(games);
      if (pulse.phase === 'PRE_WEEK') {
        setActiveSlot('tuesday');
        return;
      }
      const pstDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(new Date());
      if (pstDay === 'Tue' || pstDay === 'Wed' || pstDay === 'Thu') {
        setActiveSlot('tuesday');
      } else if (pstDay === 'Fri' || pstDay === 'Sat') {
        setActiveSlot(cadence === 2 ? 'sunday' : 'friday');
      } else {
        setActiveSlot('sunday');
      }
    } catch (e) {}
  }, [dispatches, games, cadence]);
  
  // Gmail Drafting State
  const [isDrafting, setIsDrafting] = useState<boolean>(false);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  
  // Zoom level: 'fit' | '100' | '125'
  const [zoomLevel, setZoomLevel] = useState<'fit' | '100' | '125'>('100');

  // Export status
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [generatingDocxId, setGeneratingDocxId] = useState<string | null>(null);

  // Rewrite / Shuffle State
  const [isRewriting, setIsRewriting] = useState<boolean>(false);
  const [rewriteNotice, setRewriteNotice] = useState<string | null>(null);

  const isAdmin = activePlayer?.role === 'admin' || activePlayer?.name === poolConfig.adminName;

  // Slot definitions filtered by league dispatchCadence (1 = Tuesday only, 2 = Sunday + Tuesday, 3 = Friday + Sunday + Tuesday)
  const slots = useMemo(() => {
    const allSlots = [
      {
        id: 'friday' as const,
        label: 'Friday Night Wire',
        tag: 'Slot 1',
        schedule: 'Fri 6:00 PM',
        desc: 'TNF Recap, injury wire & weekend marquee matchups'
      },
      {
        id: 'sunday' as const,
        label: 'Sunday Night Recap',
        tag: 'Slot 2',
        schedule: 'Sun 8:30 PM',
        desc: 'Sunday frenzy, podium shuffle & MNF preview'
      },
      {
        id: 'tuesday' as const,
        label: 'Tuesday Final',
        tag: 'Slot 3',
        schedule: 'Tue 7:30 AM',
        desc: 'MNF climax, weekly crown & locked standings'
      }
    ];
    if (cadence === 1) return allSlots.filter(s => s.id === 'tuesday');
    if (cadence === 2) return allSlots.filter(s => s.id === 'sunday' || s.id === 'tuesday');
    return allSlots;
  }, [cadence]);

  // Find the dispatch for current slot
  const currentSlotDispatch = useMemo(() => {
    const matching = dispatches.filter(d => {
      const isCorrectSlot = d.type === activeSlot || d.id === `dispatch-${activeSlot}` || d.id?.startsWith(`dispatch-${activeSlot}-`);
      const isNotFuture = (d.week || 0) <= currentWeek;
      return isCorrectSlot && isNotFuture;
    });
    if (matching.length === 0) return null;
    matching.sort((a, b) => (b.week || 0) - (a.week || 0));
    return matching[0];
  }, [dispatches, activeSlot, currentWeek]);

  // Dynamically synchronize the Official Standings Ledger in the dispatch with live seasonHistory
  // so any audited score corrections are always 100% accurate
  const displayHtml = useMemo(() => {
    const raw = currentSlotDispatch?.body_html || currentSlotDispatch?.content || '';
    if (!raw) return '';
    // If raw already contains rendered broadsheet ledger with crown highlights, return pristine HTML
    if (raw.includes('👑') || raw.includes('OFFICIAL CUMULATIVE SEASON STANDINGS LEDGER')) return raw;
    if (!seasonHistory?.records || activeSlot !== 'friday') return raw;

    let updated = raw;

    Object.entries(seasonHistory.records).forEach(([name, rec]: [string, any]) => {
      const w1 = rec.weeklyBreakdown?.[1]?.wins;
      const w2 = rec.weeklyBreakdown?.[2]?.wins;
      const total = rec.totalWins;
      if (w1 === undefined && w2 === undefined && total === undefined) return;

      const newW1 = w1 !== undefined ? w1 : 0;
      const newW2 = w2 !== undefined ? w2 : 0;
      const newTotal = total !== undefined ? total : (newW1 + newW2);

      // Regex 1: Matches table rows with <span>[name]</span>
      const spanRowRegex = new RegExp(
        `(<tr[^>]*>[\\s\\S]*?>${name}<\\/span>[\\s\\S]*?<td[^>]*>)\\d+(<\\/td>[\\s\\S]*?<td[^>]*>)\\d+(<\\/td>[\\s\\S]*?<td[^>]*>)\\d+(<\\/td>[\\s\\S]*?<\\/tr>)`,
        'i'
      );
      if (spanRowRegex.test(updated)) {
        updated = updated.replace(spanRowRegex, (_match, prefix, mid1, mid2, suffix) => {
          return `${prefix}${newW1}${mid1}${newW2}${mid2}${newTotal}${suffix}`;
        });
      }

      // Regex 2: Matches table rows with direct text >[name]<
      const plainRowRegex = new RegExp(
        `(<tr[^>]*>[\\s\\S]*?>${name}<\\/td>[\\s\\S]*?<td[^>]*>)\\d+(<\\/td>[\\s\\S]*?<td[^>]*>)\\d+(<\\/td>[\\s\\S]*?<td[^>]*>)\\d+(<\\/td>[\\s\\S]*?<\\/tr>)`,
        'i'
      );
      if (plainRowRegex.test(updated)) {
        updated = updated.replace(plainRowRegex, (_match, prefix, mid1, mid2, suffix) => {
          return `${prefix}${newW1}${mid1}${newW2}${mid2}${newTotal}${suffix}`;
        });
      }
    });

    return updated;
  }, [currentSlotDispatch, seasonHistory]);

  // Copy dispatch HTML/Text to clipboard
  const handleCopy = (d: WeeklyDispatch) => {
    const text = displayHtml || d.content || d.body_html || '';
    navigator.clipboard.writeText(text);
    setCopiedId(d.id);
    setSafeTimeout(() => setCopiedId(null), 2500);
  };

  // Download dispatch as printable PDF
  const handleDownloadPdf = async (d: WeeklyDispatch) => {
    setGeneratingPdfId(d.id);
    try {
      if (d.pdfUrl) {
        const link = document.createElement('a');
        link.href = d.pdfUrl;
        const safeName = (poolConfig.leagueName || 'Umpire_Pool').replace(/[^a-zA-Z0-9_-]/g, '_');
        link.download = `${safeName}_${d.type.toUpperCase()}_Week_${d.week || currentWeek}.pdf`;
        link.click();
      } else {
        await generateDispatchPDF(d, games, players, picks);
      }
    } catch (err) {
      console.error('PDF download error:', err);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  // Download dispatch as formatted Word DOCX
  const handleDownloadDocx = async (d: WeeklyDispatch) => {
    setGeneratingDocxId(d.id);
    try {
      await generateDispatchDocx(d, games, players, picks);
    } catch (err) {
      console.error('DOCX download error:', err);
    } finally {
      setGeneratingDocxId(null);
    }
  };

  // Auto-Draft dispatch to Gmail Drafts folder
  const handleDraftDispatch = async (d: WeeklyDispatch) => {
    setIsDrafting(true);
    setDraftError(null);
    setDraftSuccess(null);
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

      // 1. Try server-side API drafting first for durable synchronization
      const res = await fetch('/api/admin/draft-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatchId: d.id, token })
      });

      if (res.ok) {
        const data = await res.json();
        d.status = 'drafted';
        d.draftId = data.draftId;
        d.draftUrl = data.draftUrl;
        await publishDispatchGlobally(d);
        setDraftSuccess(`✓ Successfully placed in Gmail Drafts (${poolConfig.adminEmail})!`);
        setSafeTimeout(() => setDraftSuccess(null), 5000);
        return;
      }

      // 2. Client-side fallback to direct Gmail API draft creation
      const adminEmail = players.find(p => p.role === 'admin')?.email || poolConfig.adminEmail;
      const activeContenderEmails = players
        .filter(p => p.isActive !== false && !p.isElvis && p.email && p.email.includes('@'))
        .map(p => p.email);

      const draftRes = await createGmailDraft({
        subject: d.subject || d.title,
        bodyText: d.body_html || d.content || '',
        to: adminEmail,
        bccList: activeContenderEmails,
        token: token || undefined
      });

      const updatedDispatch: WeeklyDispatch = {
        ...d,
        status: 'drafted',
        draftId: draftRes.id,
        draftUrl: draftRes.draftUrl
      };

      await publishDispatchGlobally(updatedDispatch);
      d.status = 'drafted';
      d.draftId = draftRes.id;
      d.draftUrl = draftRes.draftUrl;
      setDraftSuccess(`✓ Successfully placed in Gmail Drafts (${adminEmail})!`);
      setSafeTimeout(() => setDraftSuccess(null), 5000);
    } catch (err: any) {
      console.error('Draft error:', err);
      setDraftError(err.message || 'Failed to stage draft in Gmail');
    } finally {
      setIsDrafting(false);
    }
  };

  // Shuffle / Rewrite Dispatch autonomously with fresh AI commentary & live scores
  const handleRewriteDispatch = async () => {
    setIsRewriting(true);
    setRewriteNotice(null);
    try {
      const res = await fetch('/api/admin/clock-test-dispatch', {
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
      if (data.dispatch) {
        if (onPublishDispatch) {
          await onPublishDispatch(data.dispatch);
        } else {
          await publishDispatchGlobally(data.dispatch);
        }
        setRewriteNotice(`✨ Dispatch rewritten! Fresh AI Crew Chief commentary & live scores updated for ${activeSlot === 'friday' ? 'Friday Wire' : activeSlot === 'sunday' ? 'Sunday Recap' : 'Tuesday Crown'}.`);
        setSafeTimeout(() => setRewriteNotice(null), 6000);
      }
    } catch (err: any) {
      console.error('Rewrite dispatch error:', err);
      setRewriteNotice(`Error rewriting dispatch: ${err.message}`);
      setSafeTimeout(() => setRewriteNotice(null), 6000);
    } finally {
      setIsRewriting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-2 sm:px-4 pb-12">
      {/* Tab Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-[#064e3b] to-emerald-950 text-white p-5 rounded-2xl border-2 border-emerald-700/80 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-400 text-slate-950 font-black text-[10px] uppercase px-2 py-0.5 rounded tracking-wider shadow-xs">
                ⚾ {poolConfig.associationName} • {poolConfig.seasonYear} SEASON
              </span>
              <span className="text-emerald-300 text-xs font-semibold">
                Week {currentWeek} BroadSheet
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-amber-200 uppercase tracking-tight mt-1 flex items-center gap-2">
              <span>{poolConfig.leagueName} Dispatches</span>
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/90 mt-1 max-w-xl font-medium">
              Scaled 8.5&quot; &times; 11&quot; digital dispatches, vibrant color-coded standings, and Crew Chief game analysis.
            </p>
          </div>

          {/* Admin Navigation Quick Link */}
          {isAdmin && onNavigateToAdmin && (
            <div className="shrink-0">
              <button
                onClick={onNavigateToAdmin}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer"
                title="Open the Admin Hub to generate dispatches, edit rich content, or broadcast via Gmail"
              >
                <span>⚙️ Manage Dispatches in Admin Hub →</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* SEQUENCED 8.5" × 11" DISPATCH SLOTS SELECTOR */}
      {/* ======================================================== */}
      <div className="bg-white p-2 rounded-2xl border-2 border-slate-300 shadow-xs">
        <div className="text-[11px] font-black uppercase text-slate-500 px-2 py-1 tracking-wider">
          Weekly Dispatch Sequence • {slots.length} Active {slots.length === 1 ? 'Edition' : 'Editions'} Per Week
        </div>
        <div className={`grid grid-cols-1 ${slots.length === 1 ? 'md:grid-cols-1' : slots.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-2 mt-1`}>
          {slots.map(s => {
            const matching = dispatches.filter(d => d.type === s.id || d.id === `dispatch-${s.id}` || d.id?.startsWith(`dispatch-${s.id}-`));
            const slotDispatch = matching.sort((a, b) => (b.week || 0) - (a.week || 0))[0] || null;
            const hasDispatch = !!slotDispatch;
            const hasPodcast = !!slotDispatch?.podcastUrl;
            const isSelected = activeSlot === s.id;

            return (
              <button
                key={s.id}
                onClick={() => setActiveSlot(s.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-gradient-to-br from-emerald-950 to-[#064e3b] text-white border-emerald-900 shadow-md ring-2 ring-amber-400'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        isSelected 
                          ? 'bg-amber-400 text-slate-950 font-bold' 
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {s.tag}
                      </span>
                      {hasPodcast && (
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${
                          isSelected ? 'bg-amber-300 text-slate-950' : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}>
                          <Headphones className="w-2.5 h-2.5" />
                          <span>5-Min Pod</span>
                        </span>
                      )}
                    </div>
                    <span className={`text-[11px] font-semibold flex items-center gap-1 ${
                      isSelected ? 'text-amber-200' : 'text-slate-500'
                    }`}>
                      <Clock className="w-3 h-3" />
                      <span>{s.schedule}</span>
                    </span>
                  </div>
                  <h3 className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                    {s.label}
                  </h3>
                  <p className={`text-xs mt-0.5 line-clamp-1 ${isSelected ? 'text-emerald-100/90' : 'text-slate-500'}`}>
                    {s.desc}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                  <span className={`flex items-center gap-1 font-bold ${
                    hasDispatch 
                      ? (isSelected ? 'text-amber-300' : 'text-emerald-700') 
                      : (isSelected ? 'text-emerald-300/70' : 'text-slate-400')
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${hasDispatch ? 'bg-emerald-400' : 'bg-slate-300'}`}></span>
                    <span>{hasDispatch ? 'Digital Sheet Ready' : 'Empty Slot'}</span>
                  </span>
                  <span className={`text-[10px] font-semibold underline ${isSelected ? 'text-amber-200' : 'text-slate-600'}`}>
                    {isSelected ? 'Viewing Sheet →' : 'Switch to Slot'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 8.5" × 11" DIGITAL CANVAS PRESENTATION & CONTROLS */}
      {/* ======================================================== */}
      <div className="space-y-3">
        {/* Canvas Toolbar: Zoom & Export Controls */}
        <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-300 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
              <Newspaper className="w-4 h-4 text-emerald-800" />
              <span>Scaled 8.5" × 11" BroadSheet View</span>
            </span>
            <span className="text-slate-500 hidden sm:inline">
              Letter Ratio • Digital Presentation Canvas
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Toggles */}
            <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 shadow-2xs">
              <button
                onClick={() => setZoomLevel('fit')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  zoomLevel === 'fit' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Fit sheet to width"
              >
                Fit
              </button>
              <button
                onClick={() => setZoomLevel('100')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  zoomLevel === '100' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="100% Full letter scale"
              >
                100%
              </button>
              <button
                onClick={() => setZoomLevel('125')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
                  zoomLevel === '125' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="125% High magnification"
              >
                125%
              </button>
            </div>

            {/* Export & Copy buttons */}
            {currentSlotDispatch && (
              <>
                <button
                  onClick={() => handleCopy(currentSlotDispatch)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer shadow-2xs"
                  title="Copy formatted dispatch"
                >
                  {copiedId === currentSlotDispatch.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleDownloadPdf(currentSlotDispatch)}
                  disabled={generatingPdfId === currentSlotDispatch.id}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Download standard printable PDF broadsheet"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>{generatingPdfId === currentSlotDispatch.id ? 'PDF...' : 'PDF'}</span>
                </button>

                <button
                  onClick={() => handleDownloadDocx(currentSlotDispatch)}
                  disabled={generatingDocxId === currentSlotDispatch.id}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Export official formatted DOCX dispatch"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>{generatingDocxId === currentSlotDispatch.id ? 'DOCX...' : 'DOCX'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Scaled Presentation Viewport */}
        <div className="w-full overflow-x-auto flex justify-center py-2 bg-slate-200/70 p-2 sm:p-6 rounded-2xl border-2 border-slate-300 shadow-inner">
          <div 
            className="w-full transition-all duration-200"
            style={{
              maxWidth: zoomLevel === 'fit' ? '100%' : zoomLevel === '100' ? '850px' : '1020px'
            }}
          >
            {/* Pristine Document Display Canvas */}
            <div className="bg-white rounded-2xl shadow-xl border-2 border-slate-300 overflow-hidden relative min-h-[600px] p-4 sm:p-8">
              {currentSlotDispatch ? (
                currentSlotDispatch.isPdfUpload && currentSlotDispatch.pdfUrl ? (
                  <MultiPagePdfViewer 
                    pdfUrl={currentSlotDispatch.pdfUrl} 
                    title={currentSlotDispatch.title} 
                    zoomLevel={zoomLevel} 
                  />
                ) : currentSlotDispatch.imageUrl ? (
                  <div className="flex justify-center p-2">
                    <img 
                      src={currentSlotDispatch.imageUrl} 
                      alt={currentSlotDispatch.title}
                      className="max-w-full h-auto rounded-xl shadow-md border border-slate-200" 
                    />
                  </div>
                ) : (
                  <div 
                    className="prose max-w-none text-slate-900"
                    dangerouslySetInnerHTML={{ 
                      __html: displayHtml
                    }}
                  />
                )
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center border-2 border-slate-200">
                    <Newspaper className="w-8 h-8 text-slate-400" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-base">
                      {slots.find(s => s.id === activeSlot)?.label} Staging Pending
                    </h4>
                    <p className="text-xs text-slate-500 max-w-sm mt-1">
                      {slots.find(s => s.id === activeSlot)?.desc}. This sheet will be published autonomously at {slots.find(s => s.id === activeSlot)?.schedule}.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Digital Watermark Strip */}
            <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 text-[10px] text-slate-500 flex items-center justify-between font-mono mt-1 rounded-b-xl">
              <span>{poolConfig.leagueName} • 40th Anniversary Season</span>
              <span>
                Straight-Up Wins Only • {currentSlotDispatch?.pdfUrl ? 'Multi-Page BroadSheet' : 'Page 1 of 1'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* INJURY & WEATHER INTEL BULLETIN */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Week {currentWeek} Injury & Line Alerts</span>
          </div>
          <ul className="text-xs text-amber-950/90 space-y-1.5 list-disc pl-4">
            <li>Review kickoff times closely: games lock individually at the opening whistle.</li>
            <li>Monday Night Football combined point prediction is exclusively for weekly 1st-place ties.</li>
            <li>Straight-up outright picks only — no spread cushions in {poolConfig.leagueName}.</li>
          </ul>
        </div>

        <div className="bg-sky-50/80 border border-sky-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center gap-2 text-sky-900 font-bold text-sm mb-2">
            <CloudSun className="w-4 h-4 text-sky-600" />
            <span>Weekend Weather & Field Conditions</span>
          </div>
          <ul className="text-xs text-sky-950/90 space-y-1.5 list-disc pl-4">
            <li>Outdoor venues: Check wind and rain reports before locking final Sunday picks.</li>
            <li>Monday Night Football venue: Optimal conditions projected for the week's tiebreaker showdown.</li>
            <li>All 16 matchups are tracked live with direct ESPN server-authoritative score syncing.</li>
          </ul>
        </div>
      </div>
    </div>
  );
});
