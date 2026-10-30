import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppNavigation, TabId } from './components/Navigation';
import { WeeklyPicksTab } from './components/WeeklyPicksTab';
import { LegacyLeaderboardTab } from './components/LegacyLeaderboardTab';
import { ConsultantsCornerTab } from './components/ConsultantsCornerTab';
import { FridayWireTab } from './components/FridayWireTab';
import { AdminHubTab } from './components/AdminHubTab';
import { LockerRoomTab } from './components/LockerRoomTab';
import { HelpModal } from './components/HelpModal';
import { UmpireFineJarModal } from './components/UmpireFineJarModal';
import { SetupWizardModal } from './components/SetupWizardModal';
import { PoolSetupConfig, getSavedPoolConfig, savePoolConfig } from './config/leagueConfig';
import { fetchLiveNFLScores, broadcastGames } from './utils/liveScoringService';
import { 
  pruneLegacyLocalStorage, 
  normalizeAllPicks, 
  normalizeGames,
  ACTIVE_STORAGE_KEYS,
  BANNED_PLACEHOLDER_NAMES
} from './utils/storageSanitizer';
import { 
  INITIAL_PLAYERS, 
  INITIAL_GAMES, 
  INITIAL_PICKS, 
  INITIAL_DISPATCHES, 
  INITIAL_MESSAGES, 
  INITIAL_FINES,
  INITIAL_SEASON_HISTORY
} from './data/initialData';
import { Game, Player, PlayerPickData, WeeklyDispatch, ChatMessage, FineItem, SeasonHistory, SeasonRecord, WeeklyRecord } from './types';
import {
  fetchGlobalPoolData,
  publishDispatchGlobally,
  savePicksGlobally,
  updateGamesGlobally,
  updatePlayerGlobally,
  postChatMessageGlobally,
  deleteChatMessageGlobally,
  addFineGlobally,
  toggleFinePaidGlobally,
  updateSeasonHistoryGlobally,
  repairRosterGlobally,
  syncScoresWithServer,
  advanceWeekSafely,
  removeDispatchGlobally
} from './services/poolSyncService';
import { onSnapshot, collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './lib/firebase-client';
import { trySilentGoogleAuth } from './services/gmailService';

export default function App() {
  // Prune legacy storage artifacts once on app startup
  useEffect(() => {
    pruneLegacyLocalStorage();
  }, []);

  // Load saved active player from localStorage or default to null
  const [activePlayer, setActivePlayer] = useState<Player | null>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_STORAGE_KEYS.ACTIVE_PLAYER_ID);
      if (saved) {
        const found = INITIAL_PLAYERS.find(p => p.id === saved);
        if (found) return found;
      }
    } catch (e) {}
    return null;
  });

  const [currentTab, setCurrentTab] = useState<TabId>('picks');
  const [isGlobalHelpOpen, setIsGlobalHelpOpen] = useState<boolean>(false);

  // White-Label Umpire Pool Configuration & Setup Wizard State
  const [poolConfig, setPoolConfig] = useState<PoolSetupConfig>(() => getSavedPoolConfig());
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState<boolean>(() => !getSavedPoolConfig().isConfigured);

  const handleOpenSetupWizard = useCallback(() => setIsSetupWizardOpen(true), []);
  const handleCloseSetupWizard = useCallback(() => setIsSetupWizardOpen(false), []);

  const handleCompleteSetup = useCallback(async (newConfig: PoolSetupConfig, updatedPlayers?: Player[]) => {
    const wasAlreadyConfigured = Boolean(poolConfig.isConfigured);
    const finalized: PoolSetupConfig = { ...newConfig, isConfigured: true };
    setPoolConfig(finalized);
    savePoolConfig(finalized);
    setIsSetupWizardOpen(false);

    if (Array.isArray(updatedPlayers)) {
      setPlayers(updatedPlayers);
      try {
        localStorage.setItem(ACTIVE_STORAGE_KEYS.PLAYERS, JSON.stringify(updatedPlayers));
      } catch (e) {}
      const firstHuman = updatedPlayers.find(p => !p.isElvis && p.id !== 'elvis') || updatedPlayers[0] || null;
      if (firstHuman && !activePlayer) {
        setActivePlayer(firstHuman);
        try {
          localStorage.setItem(ACTIVE_STORAGE_KEYS.ACTIVE_PLAYER_ID, firstHuman.id);
        } catch (e) {}
      }
    }

    if (!wasAlreadyConfigured) {
      setDispatches([]);
      setFines([]);
      setMessages([]);
    }

    try {
      const res = await fetch('/api/pool-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolConfig: finalized,
          players: Array.isArray(updatedPlayers) ? updatedPlayers : undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.players) && data.players.length > 0) {
          setPlayers(data.players);
        }
        if (Array.isArray(data.games) && data.games.length > 0) {
          setGames(normalizeGames(data.games));
        }
        if (data.picks && typeof data.picks === 'object') {
          setAllPicks(normalizeAllPicks(data.picks, data.players || updatedPlayers || [], data.games));
        }
        if (Array.isArray(data.dispatches)) {
          setDispatches(data.dispatches);
        }
        if (data.seasonHistory) {
          setSeasonHistory(data.seasonHistory);
        }
      }
    } catch (err) {
      console.warn('[App] Failed to persist pool config to server:', err);
    }
  }, [poolConfig.isConfigured, activePlayer]);

  // Compact & mobile view modes
  const [isCompactMode, setIsCompactMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nfl_pool_compact_mode');
      if (saved !== null) return JSON.parse(saved);
      if (typeof window !== 'undefined') return window.innerWidth < 768;
    } catch (e) {}
    return true;
  });

  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nfl_pool_header_collapsed');
      if (saved !== null) return JSON.parse(saved);
    } catch (e) {}
    return false;
  });

  const handleToggleCompactMode = useCallback(() => {
    setIsCompactMode(prev => {
      const next = !prev;
      try {
        localStorage.setItem('nfl_pool_compact_mode', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const handleToggleHeaderCollapsed = useCallback(() => {
    setIsHeaderCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('nfl_pool_header_collapsed', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, []);

  // Live scoring state (autohide by default)
  const [showLiveScores, setShowLiveScores] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nfl_pool_show_live_scores');
      if (saved !== null) return JSON.parse(saved);
    } catch (e) {}
    return false; // Default: autohidden
  });
  const [isSyncingScores, setIsSyncingScores] = useState<boolean>(false);
  const [lastScoreSyncTime, setLastScoreSyncTime] = useState<string>(() => 
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);

  // Cross-tab real-time sync for chat messages
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel('nfl_pool_chat_channel');
        channel.onmessage = (event) => {
          if (event.data && event.data.type === 'NEW_MESSAGE' && event.data.message) {
            setMessages(prev => {
              if (prev.some(m => m.id === event.data.message.id)) return prev;
              return [...prev, event.data.message];
            });
          } else if (event.data && event.data.type === 'DELETE_MESSAGE' && event.data.id) {
            setMessages(prev => prev.filter(m => m.id !== event.data.id));
          }
        };
      }
    } catch (e) {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'nfl_pool_messages_v1' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setMessages(parsed);
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        try {
          channel.close();
        } catch (e) {}
      }
    };
  }, []);

  // Cross-tab real-time sync for games & live scores
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel('nfl_pool_games_channel');
        channel.onmessage = (event) => {
          if (event.data && event.data.type === 'GAMES_UPDATED' && Array.isArray(event.data.games)) {
            setGames(event.data.games);
            setLastScoreSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          }
        };
      }
    } catch (e) {}

    const handleStorage = (e: StorageEvent) => {
      if ((e.key === 'nfl_pool_games_v4' || e.key === 'nfl_pool_games_v3' || e.key === 'nfl_pool_games_v2' || e.key === 'nfl_pool_games_v1') && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setGames(parsed);
            setLastScoreSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          }
        } catch (err) {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        try {
          channel.close();
        } catch (e) {}
      }
    };
  }, []);

  // Master State for Games, Picks, Players, Dispatches, and Chat
  const [games, setGames] = useState<Game[]>(() => {
    try {
      const savedV8 = localStorage.getItem(ACTIVE_STORAGE_KEYS.GAMES);
      if (savedV8) {
        const parsed: Game[] = JSON.parse(savedV8);
        if (Array.isArray(parsed) && parsed.length > 0 && (parsed[0]?.week || 0) >= 1) {
          return parsed;
        }
      }
    } catch (e) {}
    return INITIAL_GAMES;
  });

  const [players, setPlayers] = useState<Player[]>(() => {
    try {
      const savedV10 = localStorage.getItem(ACTIVE_STORAGE_KEYS.PLAYERS);
      if (savedV10) {
        const parsed: Player[] = JSON.parse(savedV10);
        const filtered = parsed
          .filter(p => !BANNED_PLACEHOLDER_NAMES.has(p.id.toLowerCase()) && !BANNED_PLACEHOLDER_NAMES.has(p.name.toLowerCase()))
          .map(p => (p.id === 'elvis' ? { ...p, name: 'Elvis' } : p));
        return filtered;
      }
    } catch (e) {}
    return INITIAL_PLAYERS;
  });

  const [allPicks, setAllPicks] = useState<Record<string, PlayerPickData>>(() => {
    try {
      const savedV13 = localStorage.getItem(ACTIVE_STORAGE_KEYS.PICKS);
      if (savedV13) {
        const parsed: Record<string, PlayerPickData> = JSON.parse(savedV13);
        return parsed;
      }
    } catch (e) {}
    return INITIAL_PICKS;
  });

  const [dispatches, setDispatches] = useState<WeeklyDispatch[]>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_STORAGE_KEYS.DISPATCHES);
      if (saved) {
        const parsed: WeeklyDispatch[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return INITIAL_DISPATCHES;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_STORAGE_KEYS.MESSAGES);
      if (saved) {
        const parsed: ChatMessage[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const realMessages = parsed.filter(m => 
            !['msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5', 'msg-6'].includes(m.id) &&
            !m.text?.includes("Welcome to Year 40, everyone") &&
            !m.text?.includes("disputes cost $1 for the Little League") &&
            !m.text?.includes("App is live! Remember you don't need a password")
          );
          return realMessages;
        }
      }
    } catch (e) {}
    return INITIAL_MESSAGES;
  });

  const [fines, setFines] = useState<FineItem[]>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_STORAGE_KEYS.FINES);
      if (saved) {
        const parsed: FineItem[] = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return INITIAL_FINES;
  });

  const [seasonHistory, setSeasonHistory] = useState<SeasonHistory>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_STORAGE_KEYS.SEASON_HISTORY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return INITIAL_SEASON_HISTORY;
  });

  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const gamesRef = useRef(games);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  const allPicksRef = useRef(allPicks);
  useEffect(() => {
    allPicksRef.current = allPicks;
  }, [allPicks]);

  const [isFineJarOpen, setIsFineJarOpen] = useState(false);

  // Persist state changes
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEYS.GAMES, JSON.stringify(games));
    } catch (e) {}
  }, [games]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEYS.PLAYERS, JSON.stringify(players));
    } catch (e) {}
  }, [players]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEYS.PICKS, JSON.stringify(allPicks));
    } catch (e) {}
  }, [allPicks]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEYS.DISPATCHES, JSON.stringify(dispatches));
    } catch (e) {}
  }, [dispatches]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
    } catch (e) {}
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEYS.FINES, JSON.stringify(fines));
    } catch (e) {}
  }, [fines]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEYS.SEASON_HISTORY, JSON.stringify(seasonHistory));
    } catch (e) {}
  }, [seasonHistory]);

  // Master Global Sync: Hydrates state from server on reload & cross-browser updates
  const syncWithGlobalServer = useCallback(async (isInitial = false) => {
    try {
      const data = await fetchGlobalPoolData();
      if (data) {
        if (Array.isArray(data.games) && data.games.length > 0) {
          setGames(normalizeGames(data.games));
        }
        if (Array.isArray(data.players)) {
          const cleanPlayers = data.players.filter(p => 
            !BANNED_PLACEHOLDER_NAMES.has(p.id.toLowerCase()) && 
            !BANNED_PLACEHOLDER_NAMES.has(p.name.toLowerCase())
          );
          setPlayers(cleanPlayers);
          if (cleanPlayers.length > 0) {
            setActivePlayer(prev => {
              if (prev && cleanPlayers.some(p => p.id === prev.id || p.name === prev.name)) {
                return cleanPlayers.find(p => p.id === prev.id || p.name === prev.name) || prev;
              }
              const adminPlayer = cleanPlayers.find(p => p.role === 'admin') || cleanPlayers.find(p => !p.isElvis) || cleanPlayers[0];
              if (adminPlayer) {
                try {
                  localStorage.setItem(ACTIVE_STORAGE_KEYS.ACTIVE_PLAYER_ID, adminPlayer.id);
                } catch (e) {}
              }
              return adminPlayer || null;
            });
          }
        }
        if (data.picks && typeof data.picks === 'object') {
          const normalized = normalizeAllPicks(data.picks || {}, data.players || INITIAL_PLAYERS, data.games);
          setAllPicks(normalized);
        }
        if (Array.isArray(data.dispatches)) {
          const cleanDispatches = data.dispatches.filter(d => 
            d && d.id && d.id !== 'dispatch-2012-classic'
          );
          setDispatches(cleanDispatches);
        }
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
        if (Array.isArray(data.fines)) {
          setFines(data.fines);
        }
        if (data.seasonHistory && data.seasonHistory.records) {
          setSeasonHistory(data.seasonHistory);
        }
        if ((data as any).poolConfig && (data as any).poolConfig.leagueName) {
          const remoteConfig = (data as any).poolConfig as PoolSetupConfig;
          if (remoteConfig.isConfigured && Array.isArray(data.players) && data.players.length > 0) {
            setPoolConfig(remoteConfig);
            savePoolConfig(remoteConfig);
            if (isInitial) {
              setIsSetupWizardOpen(false);
            }
          } else if (isInitial) {
            setIsSetupWizardOpen(true);
          }
        }
      }
    } catch (err) {
      console.warn('[App] Global sync error:', err);
    }
  }, []);

  // Week Transition & Auto-Purge: Detect when week number advances and clear stale local storage picks
  const activeWeekNum = games.find(g => typeof g.week === 'number' && g.week > 0)?.week || games[0]?.week || 4;
  const prevActiveWeekRef = useRef<number>(activeWeekNum);
  useEffect(() => {
    if (prevActiveWeekRef.current !== activeWeekNum) {
      console.log(`[App] Week change detected (${prevActiveWeekRef.current} -> ${activeWeekNum}). Purging local pick caches for clean slate.`);
      prevActiveWeekRef.current = activeWeekNum;
      ['nfl_pool_picks_v7', 'nfl_pool_picks_v8', 'nfl_pool_picks_v9', 'nfl_pool_picks_v10', 'nfl_pool_picks_v11', 'nfl_pool_picks_v12'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      syncWithGlobalServer();
    }
  }, [activeWeekNum, syncWithGlobalServer]);

  // REAL-TIME FIRESTORE SYNCHRONIZATION
  // This ensures that verified picks and other live updates show up instantly across all devices
  useEffect(() => {
    if (!db) return;
    console.log('[Firebase] Initializing real-time cloud listeners...');
    
    // 1. Listen for Picks directly from Cloud Firestore
    const unsubPicks = onSnapshot(collection(db, 'picks'), (snap) => {
      const picksMap: Record<string, PlayerPickData> = {};
      snap.forEach(doc => {
        picksMap[doc.id] = doc.data() as PlayerPickData;
      });
      
      console.log('[Firebase] Real-time active Picks from Firestore:', Object.keys(picksMap));
      
      const currentRoster = playersRef.current || INITIAL_PLAYERS;
      const rosterPicks: Record<string, PlayerPickData> = {};
      
      currentRoster.forEach(p => {
        const cleanName = p.id === 'elvis' ? 'Elvis' : p.name;
        if (picksMap[cleanName] && Object.keys(picksMap[cleanName].picks || {}).length > 0) {
          rosterPicks[cleanName] = picksMap[cleanName];
        } else if (cleanName === 'Elvis') {
          // If Firestore returns an empty document for Elvis, protect existing memory/localStorage picks
          const existingElvis = allPicksRef.current?.['Elvis'];
          if (existingElvis && Object.keys(existingElvis.picks || {}).length > 0) {
            rosterPicks['Elvis'] = existingElvis;
          } else {
            rosterPicks['Elvis'] = {
              contenderName: 'Elvis',
              picks: {},
              tiebreaker: ''
            };
          }
        } else {
          rosterPicks[cleanName] = {
            contenderName: cleanName,
            picks: {},
            tiebreaker: ''
          };
        }
      });

      setAllPicks(normalizeAllPicks(rosterPicks, currentRoster, gamesRef.current));
    }, (error) => {
      console.error('[Firebase] Picks listener error:', error);
    });

    // 2. Listen for Games
    const unsubGames = onSnapshot(doc(db, 'metadata', 'games'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.games)) {
          setGames(normalizeGames(data.games));
        }
      }
    });

    // 3. Listen for Players
    const unsubPlayers = onSnapshot(doc(db, 'metadata', 'players'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.players)) {
          const cleanPlayers = data.players.filter(p => 
            !BANNED_PLACEHOLDER_NAMES.has(p.id.toLowerCase()) && 
            !BANNED_PLACEHOLDER_NAMES.has(p.name.toLowerCase())
          );
          setPlayers(cleanPlayers);
        }
      }
    });

    // 4. Listen for Chat Messages directly from Firestore collection for persistent season-long retention
    const unsubMessages = onSnapshot(collection(db, 'messages'), (snap) => {
      const legacyFakeMessageIds = new Set(['msg-1', 'msg-2', 'msg-3', 'msg-4', 'msg-5', 'msg-6']);
      const loaded: ChatMessage[] = [];
      snap.forEach(d => {
        const data = d.data() as ChatMessage;
        if (
          data &&
          data.id &&
          data.text &&
          !legacyFakeMessageIds.has(data.id) &&
          !data.text.includes('Welcome to Year 40') &&
          !data.text.includes('Remember: disputes cost $1') &&
          !data.text.includes("App is live! Remember you don't need a password")
        ) {
          loaded.push({
            id: data.id,
            sender: data.sender || 'Contender',
            text: data.text,
            timestamp: data.timestamp || '',
            role: data.role || 'player'
          });
        }
      });

      // Sort chronologically using numeric timestamp in msg id
      loaded.sort((a, b) => {
        const getTs = (id: string) => {
          const parts = id.split('-');
          const num = parseInt(parts[1], 10);
          return !isNaN(num) && num > 1000000000000 ? num : 0;
        };
        return getTs(a.id) - getTs(b.id);
      });

      if (loaded.length > 0) {
        setMessages(loaded);
        try {
          localStorage.setItem('nfl_pool_messages_v1', JSON.stringify(loaded));
        } catch (e) {}
      }
    }, (error) => {
      console.warn('[Firebase] Messages collection listener warning:', error);
    });

    // 5. Listen for Fines
    const unsubFines = onSnapshot(doc(db, 'metadata', 'fines'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.fines)) {
          setFines(data.fines);
        }
      }
    });

    // 6. Listen for Dispatches
    const unsubDispatches = onSnapshot(doc(db, 'metadata', 'dispatches'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.dispatches)) {
          const cleanDispatches = data.dispatches.filter((d: any) => 
            d && d.id && d.id !== 'dispatch-2012-classic'
          );
          setDispatches(cleanDispatches);
        }
      }
    });

    return () => {
      unsubPicks();
      unsubGames();
      unsubPlayers();
      unsubMessages();
      unsubFines();
      unsubDispatches();
    };
  }, []);

  // Hydrate on mount, when browser tab gains focus, and on visibility change
  useEffect(() => {
    syncWithGlobalServer(true);
    trySilentGoogleAuth().catch(() => {});

    const handleFocus = () => {
      syncWithGlobalServer(false);
      trySilentGoogleAuth().catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncWithGlobalServer(false);
        trySilentGoogleAuth().catch(() => {});
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncWithGlobalServer]);

  const liveGamesCount = useMemo(() => {
    return games.filter(g => g.status === 'in_progress').length;
  }, [games]);

  const handleSelectPlayer = useCallback((player: Player | null) => {
    setActivePlayer(player);
    try {
      if (player) {
        localStorage.setItem('nfl_pool_active_player_id', player.id);
      } else {
        localStorage.removeItem('nfl_pool_active_player_id');
      }
    } catch (e) {}
  }, []);

  // Player submitting their picks
  const handleSavePicks = useCallback((contenderName: string, pickedGames: Record<number, string>, tiebreaker: number | '', adminOverride = false) => {
    const timestamp = new Date().toISOString();
    setAllPicks(prev => ({
      ...prev,
      [contenderName]: {
        contenderName,
        picks: {
          ...(prev[contenderName]?.picks || {}),
          ...pickedGames
        },
        tiebreaker,
        submittedAt: timestamp
      }
    }));
    // Save to global server storage & Firestore
    savePicksGlobally(contenderName, pickedGames, tiebreaker, timestamp, adminOverride);
  }, []);

  // Admin updating player contact info & status
  const handleUpdatePlayerContact = useCallback((id: string, email: string, phone?: string, location?: string, isActive?: boolean) => {
    setPlayers(prev => prev.map(p => p.id === id ? { 
      ...p, 
      email, 
      phone, 
      location: location !== undefined ? location : p.location,
      isActive: isActive !== undefined ? isActive : p.isActive
    } : p));
    // Save to global server storage
    updatePlayerGlobally({ id, email, phone, location, isActive });
  }, []);

  // Admin adding a new contender at any point in the season without wiping existing picks
  const handleAddContender = useCallback(async (name: string, email: string, phone?: string): Promise<{ success: boolean; error?: string }> => {
    const cleanName = name.trim();
    if (!cleanName) {
      return { success: false, error: 'Contender name is required.' };
    }
    const newPlayer: Player = {
      id: `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}`,
      name: cleanName,
      email: email.trim(),
      phone: phone?.trim() || '',
      role: 'player',
      tagline: 'Contender',
      isActive: true,
      paid: true
    };
    setPlayers(prev => {
      if (prev.some(p => p.id === newPlayer.id || p.name.toLowerCase() === newPlayer.name.toLowerCase())) {
        return prev;
      }
      const next = [...prev, newPlayer];
      try {
        localStorage.setItem(ACTIVE_STORAGE_KEYS.PLAYERS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    setAllPicks(prev => {
      if (prev[newPlayer.name]) return prev;
      return {
        ...prev,
        [newPlayer.name]: {
          contenderName: newPlayer.name,
          picks: {},
          tiebreaker: ''
        }
      };
    });
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlayer })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.players)) {
          setPlayers(data.players);
        }
        if (data.picks && typeof data.picks === 'object') {
          setAllPicks(normalizeAllPicks(data.picks, data.players || [], gamesRef.current));
        }
        if (data.seasonHistory) {
          setSeasonHistory(data.seasonHistory);
        }
        return { success: true };
      }
      return { success: false, error: 'Failed to save contender to server.' };
    } catch (err: any) {
      console.warn('[App] Failed to add contender on server:', err);
      return { success: true };
    }
  }, []);

  // Admin overriding picks for senior members (bypasses lockout)
  const handleAdminSavePicks = useCallback((contenderName: string, gamePicks: Record<number, string>, tiebreaker: number | '') => {
    handleSavePicks(contenderName, gamePicks, tiebreaker, true);
  }, [handleSavePicks]);

  // Publish a dispatch globally to all users on the wire
  const handlePublishDispatch = useCallback(async (dispatch: WeeklyDispatch) => {
    setDispatches(prev => {
      const idx = prev.findIndex(d => d.id === dispatch.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = dispatch;
        return copy;
      }
      return [dispatch, ...prev];
    });
    await publishDispatchGlobally(dispatch);
  }, []);

  // Admin updating official game winner & scores
  const handleUpdateGameStatus = useCallback((
    gameNumber: number,
    winner: string | null,
    awayScore?: number,
    homeScore?: number,
    status: 'scheduled' | 'in_progress' | 'final' = 'final'
  ) => {
    setGames(prev => {
      const updated = prev.map(g => {
        if (g.gameNumber === gameNumber) {
          const effectiveAway = awayScore !== undefined ? awayScore : g.awayScore;
          const effectiveHome = homeScore !== undefined ? homeScore : g.homeScore;
          const isTie = winner === 'TIE' || (status === 'final' && typeof effectiveAway === 'number' && typeof effectiveHome === 'number' && effectiveAway === effectiveHome);
          return {
            ...g,
            officialWinner: isTie ? 'TIE' : winner,
            isTie,
            awayScore: effectiveAway,
            homeScore: effectiveHome,
            status,
            lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          };
        }
        return g;
      });
      broadcastGames(updated);
      updateGamesGlobally(updated);
      return updated;
    });
  }, []);

  // Live Scores Sync with Server Ingestion + client fallback
  const handleSyncLiveScores = useCallback(async () => {
    setIsSyncingScores(true);
    try {
      // 1. Try server-authoritative score ingestion first
      const serverRes = await syncScoresWithServer();
      if (serverRes.success && serverRes.games && serverRes.games.length > 0) {
        setGames(serverRes.games);
        broadcastGames(serverRes.games);
        setLastScoreSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        return;
      }
      // 2. Client-side fallback if server unreachable
      const result = await fetchLiveNFLScores(games);
      setGames(result.updatedGames);
      broadcastGames(result.updatedGames);
      setLastScoreSyncTime(result.lastSyncTime);
      updateGamesGlobally(result.updatedGames);
    } catch (err) {
      console.error('Score sync failed:', err);
    } finally {
      setIsSyncingScores(false);
    }
  }, [games]);

  const handleToggleAutoSync = useCallback(() => {
    setAutoSyncEnabled(prev => !prev);
  }, []);

  const handleToggleLiveScores = useCallback(() => {
    setShowLiveScores(prev => {
      const next = !prev;
      try {
        localStorage.setItem('nfl_pool_show_live_scores', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const handleResetWeek = useCallback(async () => {
    try {
      // Clear all versions of localStorage
      ['nfl_pool_games_v4', 'nfl_pool_games_v5', 'nfl_pool_games_v6', 'nfl_pool_picks_v7', 'nfl_pool_picks_v8', 'nfl_pool_picks_v9', 'nfl_pool_picks_v10'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });
      setGames(INITIAL_GAMES);
      setAllPicks(INITIAL_PICKS);
      broadcastGames(INITIAL_GAMES);
      await updateGamesGlobally(INITIAL_GAMES);
      await fetch('/api/reset-seed', { method: 'POST' });
    } catch (e) {
      console.error('Reset week error:', e);
    }
  }, []);

  // Compile current week's wins into the running season tally
  const handleCompileWeekResults = useCallback(async (weekNumber: number = 3): Promise<{ success: boolean; winnerName?: string }> => {
    try {
      const activeContenders = players.filter(p => p.isActive !== false);
      const updatedRecords: Record<string, typeof INITIAL_SEASON_HISTORY.records[string]> = {
        ...(seasonHistory.records || {})
      };

      // Calculate wins for each contender from current games and picks
      const weekScores: { name: string; wins: number; losses: number; tb: number | '' }[] = [];

      activeContenders.forEach(p => {
        const playerPicks = allPicks[p.name]?.picks || {};
        const tbPrediction = allPicks[p.name]?.tiebreaker ?? '';
        let w = 0;
        let l = 0;

        games.forEach(g => {
          const pick = playerPicks[g.gameNumber];
          if (g.status === 'final' && g.officialWinner) {
            if (pick && pick.toLowerCase() === g.officialWinner.toLowerCase()) {
              w++;
            } else {
              l++;
            }
          }
        });

        weekScores.push({ name: p.name, wins: w, losses: l, tb: tbPrediction });
      });

      // Determine week winner(s)
      const maxWins = Math.max(...weekScores.map(s => s.wins), 0);
      const topWeekContenders = weekScores.filter(s => s.wins === maxWins);
      let weekWinnerName = topWeekContenders[0]?.name;

      // Tiebreaker check if multiple contenders tied
      const mnf = games.find(g => g.isMNF);
      const mnfActual = mnf && mnf.status === 'final' ? (mnf.awayScore || 0) + (mnf.homeScore || 0) : null;
      if (topWeekContenders.length > 1 && mnfActual !== null) {
        let bestDiff = Infinity;
        topWeekContenders.forEach(c => {
          if (typeof c.tb === 'number') {
            const diff = Math.abs(c.tb - mnfActual);
            if (diff < bestDiff) {
              bestDiff = diff;
              weekWinnerName = c.name;
            }
          }
        });
      }

      // Merge into Season Record
      weekScores.forEach(ws => {
        const existing = updatedRecords[ws.name] || {
          contenderName: ws.name,
          totalWins: 0,
          totalLosses: 0,
          weeklyBreakdown: {},
          bestWeekWins: 0,
          weeksWonCount: 0
        };

        const isWinner = ws.name === weekWinnerName;
        const newWeeklyBreakdown = {
          ...existing.weeklyBreakdown,
          [weekNumber]: {
            week: weekNumber,
            wins: ws.wins,
            losses: ws.losses,
            tiebreaker: ws.tb,
            isWinner
          }
        };

        // Accurately compile total wins and losses across all weeks in the season
        let totalWins = 0;
        let totalLosses = 0;
        let weeksWonCount = 0;
        let bestWeekWins = 0;

        Object.values(newWeeklyBreakdown).forEach((wkRecord: any) => {
          totalWins += Number(wkRecord.wins || 0);
          totalLosses += Number(wkRecord.losses || 0);
          if (wkRecord.isWinner) weeksWonCount++;
          if (Number(wkRecord.wins || 0) > bestWeekWins) bestWeekWins = Number(wkRecord.wins || 0);
        });

        updatedRecords[ws.name] = {
          ...existing,
          totalWins,
          totalLosses,
          weeklyBreakdown: newWeeklyBreakdown,
          bestWeekWins,
          weeksWonCount
        };
      });

      // Recalculate ranks across season strictly by totalWins (no tiebreaker for season standings)
      const sorted = Object.values(updatedRecords).sort((a, b) => {
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        return a.contenderName.localeCompare(b.contenderName);
      });

      let currentRank = 1;
      sorted.forEach((rec, idx) => {
        if (idx === 0) {
          rec.seasonRank = 1;
        } else {
          const prev = sorted[idx - 1];
          if (rec.totalWins < prev.totalWins) {
            currentRank = idx + 1;
            rec.seasonRank = currentRank;
          } else {
            rec.seasonRank = currentRank;
          }
        }
        updatedRecords[rec.contenderName] = rec;
      });

      const compiledWeeks = Array.from(new Set([...(seasonHistory.compiledWeeks || []), weekNumber])).sort((a, b) => a - b);
      const newHistory: SeasonHistory = {
        compiledWeeks,
        lockedWeeks: seasonHistory.lockedWeeks || [],
        records: updatedRecords,
        lastCompiledAt: `Week ${weekNumber} compiled on ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      };

      setSeasonHistory(newHistory);
      localStorage.setItem('nfl_pool_season_history_v3', JSON.stringify(newHistory));
      await updateSeasonHistoryGlobally(newHistory);

      return { success: true, winnerName: weekWinnerName };
    } catch (err) {
      console.error('Error compiling week results:', err);
      return { success: false };
    }
  }, [players, games, allPicks, seasonHistory]);

  // Standings Vault: Freeze completed week and advance pool safely
  const handleAdvanceWeekSafely = useCallback(async (weekNumber?: number): Promise<{ success: boolean; nextWeek?: number; winnerName?: string; error?: string }> => {
    try {
      // Validation Layer: Verify all current games are marked as 'final' before allowing week increment
      const activeGames = games || [];
      if (activeGames.length === 0) {
        return { success: false, error: 'Cannot advance week: No games found for the active week.' };
      }

      const nonFinalGames = activeGames.filter(g => g.status !== 'final');
      if (nonFinalGames.length > 0) {
        const pendingCount = nonFinalGames.length;
        const sampleGames = nonFinalGames.slice(0, 3).map(g => `${g.awayTeam} vs ${g.homeTeam} (${g.status || 'scheduled'})`).join(', ');
        const extra = pendingCount > 3 ? ` and ${pendingCount - 3} more` : '';
        return {
          success: false,
          error: `Cannot advance week: All games must be marked as 'final' before allowing the week to increment. Currently, ${pendingCount} game(s) are not final (${sampleGames}${extra}).`
        };
      }

      const res = await advanceWeekSafely(weekNumber);
      if (res.success) {
        if (res.seasonHistory) setSeasonHistory(res.seasonHistory);
        if (res.picks) setAllPicks(res.picks);
        ['nfl_pool_picks_v7', 'nfl_pool_picks_v8', 'nfl_pool_picks_v9', 'nfl_pool_picks_v10', 'nfl_pool_picks_v11', 'nfl_pool_picks_v12'].forEach(k => {
          try { localStorage.removeItem(k); } catch (e) {}
        });
        await syncWithGlobalServer();
        return { success: true, nextWeek: res.nextWeek, winnerName: res.winnerName };
      }
      return { success: false, error: res.error || 'Server error' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, [games, syncWithGlobalServer]);

  // Update specific contender historical week record (Manual Audit & Corrections)
  const handleUpdateHistoricalWeekRecord = useCallback(async (
    contenderName: string,
    weekNumber: number,
    wins: number,
    losses: number,
    tiebreaker: number | '',
    isWinner: boolean,
    isLocked: boolean = true,
    auditNotes?: string
  ) => {
    setSeasonHistory(prev => {
      const updatedRecords: Record<string, SeasonRecord> = { ...(prev.records || {}) };
      const contenderRecord: SeasonRecord = updatedRecords[contenderName] || {
        contenderName,
        totalWins: 0,
        totalLosses: 0,
        weeklyBreakdown: {},
        bestWeekWins: 0,
        weeksWonCount: 0
      };

      const updatedBreakdown: Record<number, WeeklyRecord> = {
        ...contenderRecord.weeklyBreakdown,
        [weekNumber]: {
          week: weekNumber,
          wins,
          losses,
          tiebreaker,
          isWinner,
          isLocked,
          auditedAt: new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
          auditNotes
        }
      };

      // Re-tally totals for this contender across all weeks
      let totalWins = 0;
      let totalLosses = 0;
      let weeksWonCount = 0;
      let bestWeekWins = 0;

      Object.values(updatedBreakdown).forEach((wk: WeeklyRecord) => {
        totalWins += wk.wins;
        totalLosses += wk.losses;
        if (wk.isWinner) weeksWonCount++;
        if (wk.wins > bestWeekWins) bestWeekWins = wk.wins;
      });

      updatedRecords[contenderName] = {
        ...contenderRecord,
        totalWins,
        totalLosses,
        weeklyBreakdown: updatedBreakdown,
        bestWeekWins,
        weeksWonCount
      };

      // Recalculate season ranks strictly by totalWins (no tiebreaker for season)
      const sorted: SeasonRecord[] = Object.values(updatedRecords).sort((a, b) => {
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        return a.contenderName.localeCompare(b.contenderName);
      });

      let currentRank = 1;
      sorted.forEach((rec, idx) => {
        if (idx === 0) {
          rec.seasonRank = 1;
        } else {
          const prevRec = sorted[idx - 1];
          if (rec.totalWins < prevRec.totalWins) {
            currentRank = idx + 1;
            rec.seasonRank = currentRank;
          } else {
            rec.seasonRank = currentRank;
          }
        }
        updatedRecords[rec.contenderName] = rec;
      });

      const newHistory: SeasonHistory = {
        ...prev,
        records: updatedRecords,
        lastAuditedAt: `Audited ${contenderName} (Wk ${weekNumber}) on ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      };

      localStorage.setItem('nfl_pool_season_history_v3', JSON.stringify(newHistory));
      updateSeasonHistoryGlobally(newHistory).then(res => {
        if (res.dispatches && res.dispatches.length > 0) {
          setDispatches(res.dispatches);
          localStorage.setItem('nfl_pool_dispatches_v2', JSON.stringify(res.dispatches));
        }
      });
      return newHistory;
    });
  }, []);

  // Lock / Freeze or Unlock a specific historical week
  const handleToggleFreezeWeek = useCallback(async (weekNumber: number, freeze: boolean) => {
    setSeasonHistory(prev => {
      const currentLocked = prev.lockedWeeks || [];
      const newLocked = freeze
        ? Array.from(new Set([...currentLocked, weekNumber]))
        : currentLocked.filter(w => w !== weekNumber);

      const updatedRecords: Record<string, SeasonRecord> = { ...(prev.records || {}) };
      Object.keys(updatedRecords).forEach(name => {
        const wk = updatedRecords[name].weeklyBreakdown[weekNumber];
        if (wk) {
          updatedRecords[name] = {
            ...updatedRecords[name],
            weeklyBreakdown: {
              ...updatedRecords[name].weeklyBreakdown,
              [weekNumber]: {
                ...wk,
                isLocked: freeze,
                auditedAt: freeze ? new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : wk.auditedAt
              }
            }
          };
        }
      });

      const newHistory: SeasonHistory = {
        ...prev,
        lockedWeeks: newLocked,
        records: updatedRecords,
        lastAuditedAt: `Week ${weekNumber} ${freeze ? 'Frozen & Locked' : 'Unlocked'} on ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      };

      localStorage.setItem('nfl_pool_season_history_v3', JSON.stringify(newHistory));
      updateSeasonHistoryGlobally(newHistory);
      return newHistory;
    });
  }, []);

  // Reset Season History to official baseline
  const handleResetSeasonHistory = useCallback(async () => {
    setSeasonHistory(INITIAL_SEASON_HISTORY);
    localStorage.setItem('nfl_pool_season_history_v3', JSON.stringify(INITIAL_SEASON_HISTORY));
    await updateSeasonHistoryGlobally(INITIAL_SEASON_HISTORY);
  }, []);

  const handleRepairRoster = useCallback(async () => {
    const res = await repairRosterGlobally();
    if (res.success && res.players) {
      setPlayers(res.players);
    }
    return res;
  }, []);

  // Background Auto-sync loop (every 30 seconds) when enabled
  useEffect(() => {
    if (!autoSyncEnabled) return undefined;
    const interval = setInterval(() => {
      fetchLiveNFLScores(gamesRef.current).then(result => {
        if (result.changedCount > 0) {
          setGames(result.updatedGames);
          broadcastGames(result.updatedGames);
          setLastScoreSyncTime(result.lastSyncTime);
        }
      }).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [autoSyncEnabled]);

  // Posting message in Locker Room with real-time broadcast & Firebase cloud persistence
  const handleSendMessage = useCallback(async (senderName: string, text: string, role: 'admin' | 'consultant' | 'player' | 'legend' = 'player') => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const formattedTime = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const formattedTimestamp = `${formattedDate} • ${formattedTime}`;

    const newMsg: ChatMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      sender: senderName,
      text,
      role,
      timestamp: formattedTimestamp
    };
    setMessages(prev => {
      const updated = [...prev, newMsg];
      try {
        localStorage.setItem('nfl_pool_messages_v1', JSON.stringify(updated));
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const ch = new BroadcastChannel('nfl_pool_chat_channel');
          ch.postMessage({ type: 'NEW_MESSAGE', message: newMsg });
          ch.close();
        }
      } catch (e) {}
      // Sync to Firebase metadata
      try {
        if (db) setDoc(doc(db, 'metadata', 'messages'), { messages: updated });
      } catch (e) {}
      return updated;
    });

    // Write to Firestore messages collection directly
    try {
      if (db) await setDoc(doc(db, 'messages', newMsg.id), newMsg);
    } catch (err) {
      console.warn('[Firebase] Messages doc write notice:', err);
    }

    // Persist to global Express backend & disk
    postChatMessageGlobally(newMsg);
  }, []);

  // Discrete deleting message in Locker Room with real-time broadcast & Firebase sync
  const handleDeleteMessage = useCallback(async (id: string) => {
    setMessages(prev => {
      const updated = prev.filter(m => m.id !== id);
      try {
        localStorage.setItem('nfl_pool_messages_v1', JSON.stringify(updated));
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          const ch = new BroadcastChannel('nfl_pool_chat_channel');
          ch.postMessage({ type: 'DELETE_MESSAGE', id });
          ch.close();
        }
      } catch (e) {}
      // Sync to Firebase metadata
      try {
        if (db) setDoc(doc(db, 'metadata', 'messages'), { messages: updated });
      } catch (e) {}
      return updated;
    });

    // Delete from Firestore messages collection
    try {
      if (db) await deleteDoc(doc(db, 'messages', id));
    } catch (err) {
      console.warn('[Firebase] Messages doc delete notice:', err);
    }

    deleteChatMessageGlobally(id);
  }, []);

  // Kangaroo Court / $1 Umpire Fine management
  const handleAddFine = useCallback((contenderName: string, reason: string, amount: number = 1) => {
    const newFine: FineItem = {
      id: 'fine-' + Date.now(),
      contenderName,
      amount,
      reason,
      date: `Week ${activeWeekNum}`,
      paid: false,
      issuedBy: activePlayer?.name ? `${activePlayer.name}` : `${poolConfig.adminName} (Pool Admin)`
    };
    setFines(prev => {
      const updated = [newFine, ...prev];
      try {
        localStorage.setItem('nfl_pool_fines_v1', JSON.stringify(updated));
      } catch (e) {}
      try {
        if (db) setDoc(doc(db, 'metadata', 'fines'), { fines: updated });
      } catch (e) {}
      return updated;
    });
    // Persist to global backend
    addFineGlobally(newFine);
  }, [activePlayer?.name, activeWeekNum, poolConfig.adminName]);

  const handleToggleFinePaid = useCallback((fineId: string) => {
    setFines(prev => {
      const updated = prev.map(f => f.id === fineId ? { ...f, paid: !f.paid } : f);
      try {
        localStorage.setItem('nfl_pool_fines_v1', JSON.stringify(updated));
      } catch (e) {}
      try {
        if (db) setDoc(doc(db, 'metadata', 'fines'), { fines: updated });
      } catch (e) {}
      return updated;
    });
    toggleFinePaidGlobally(fineId);
  }, []);

  const handleOpenHelpModal = useCallback(() => setIsGlobalHelpOpen(true), []);
  const handleCloseHelpModal = useCallback(() => setIsGlobalHelpOpen(false), []);
  const handleOpenFineJarModal = useCallback(() => setIsFineJarOpen(true), []);
  const handleCloseFineJarModal = useCallback(() => setIsFineJarOpen(false), []);

  const handleOpenPicksForContender = useCallback((p: Player) => {
    handleSelectPlayer(p);
    setCurrentTab('picks');
  }, [handleSelectPlayer]);
  const handleViewLeaderboardFromPicks = useCallback(() => setCurrentTab('leaderboard'), []);

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900 flex flex-col font-sans selection:bg-emerald-200">
      {/* Navigation Header */}
      <AppNavigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        activePlayer={activePlayer}
        allPlayers={players}
        onSelectPlayer={handleSelectPlayer}
        onOpenHelp={handleOpenHelpModal}
        onOpenFineJar={handleOpenFineJarModal}
        onOpenSetupWizard={handleOpenSetupWizard}
        poolConfig={poolConfig}
        games={games}
        showLiveScores={showLiveScores}
        onToggleLiveScores={handleToggleLiveScores}
        onSyncLiveScores={handleSyncLiveScores}
        isSyncingScores={isSyncingScores}
        lastScoreSyncTime={lastScoreSyncTime}
        autoSyncEnabled={autoSyncEnabled}
        onToggleAutoSync={handleToggleAutoSync}
        liveGamesCount={liveGamesCount}
        isCompactMode={isCompactMode}
        onToggleCompactMode={handleToggleCompactMode}
        isHeaderCollapsed={isHeaderCollapsed}
        onToggleHeaderCollapsed={handleToggleHeaderCollapsed}
      />

      {/* Main Content View */}
      <main className="flex-1">
        {currentTab === 'picks' && (
          <WeeklyPicksTab
            games={games}
            players={players}
            activePlayer={activePlayer}
            onSelectPlayer={handleSelectPlayer}
            allPicks={allPicks}
            onSavePicks={handleSavePicks}
            onViewLeaderboard={handleViewLeaderboardFromPicks}
            isCompactMode={isCompactMode}
            currentWeek={activeWeekNum}
            seasonHistory={seasonHistory}
            poolConfig={poolConfig}
          />
        )}

        {currentTab === 'leaderboard' && (
          <LegacyLeaderboardTab
            games={games}
            players={players}
            picks={allPicks}
            activePlayer={activePlayer}
            onSelectPlayerForPicks={handleOpenPicksForContender}
            showLiveScores={showLiveScores}
            onToggleLiveScores={handleToggleLiveScores}
            onSyncLiveScores={handleSyncLiveScores}
            isSyncingScores={isSyncingScores}
            lastScoreSyncTime={lastScoreSyncTime}
            autoSyncEnabled={autoSyncEnabled}
            onToggleAutoSync={handleToggleAutoSync}
            seasonHistory={seasonHistory}
            onCompileWeekResults={handleCompileWeekResults}
            onAdvanceWeekSafely={handleAdvanceWeekSafely}
            isCompactMode={isCompactMode}
            poolConfig={poolConfig}
          />
        )}

        {currentTab === 'consultant' && (
          <ConsultantsCornerTab
            poolConfig={poolConfig}
            players={players}
            fines={fines}
            onOpenSetupWizard={handleOpenSetupWizard}
          />
        )}

        {currentTab === 'wire' && (
          <FridayWireTab
            dispatches={dispatches}
            games={games}
            players={players}
            picks={allPicks}
            currentWeek={activeWeekNum}
            activePlayer={activePlayer}
            seasonHistory={seasonHistory}
            onNavigateToAdmin={() => setCurrentTab('admin')}
            poolConfig={poolConfig}
          />
        )}

        {currentTab === 'locker' && (
          <LockerRoomTab
            messages={messages}
            activePlayer={activePlayer}
            games={games}
            onSendMessage={handleSendMessage}
            onDeleteMessage={handleDeleteMessage}
            onOpenFineJar={handleOpenFineJarModal}
          />
        )}

        {currentTab === 'admin' && (
          <AdminHubTab
            games={games}
            players={players}
            picks={allPicks}
            dispatches={dispatches}
            currentWeek={activeWeekNum}
            onPublishDispatch={handlePublishDispatch}
            onDeleteDispatch={async (dispatchId: string) => {
              setDispatches(prev => prev.filter(d => d.id !== dispatchId));
              await removeDispatchGlobally(dispatchId);
            }}
            onUpdatePlayerContact={handleUpdatePlayerContact}
            onAdminSavePicks={handleAdminSavePicks}
            onUpdateGameStatus={handleUpdateGameStatus}
            onOpenFineJar={handleOpenFineJarModal}
            onSyncLiveScores={handleSyncLiveScores}
            isSyncingScores={isSyncingScores}
            lastScoreSyncTime={lastScoreSyncTime}
            autoSyncEnabled={autoSyncEnabled}
            onToggleAutoSync={handleToggleAutoSync}
            onResetWeek={handleResetWeek}
            seasonHistory={seasonHistory}
            onCompileWeekResults={handleCompileWeekResults}
            onAdvanceWeekSafely={handleAdvanceWeekSafely}
            onUpdateHistoricalWeekRecord={handleUpdateHistoricalWeekRecord}
            onToggleFreezeWeek={handleToggleFreezeWeek}
            onResetSeasonHistory={handleResetSeasonHistory}
            onRepairRoster={handleRepairRoster}
            onAddContender={handleAddContender}
            onReturnToPool={() => setCurrentTab('picks')}
            poolConfig={poolConfig}
            onOpenSetupWizard={handleOpenSetupWizard}
          />
        )}
      </main>

      {/* Footer Tribute */}
      <footer className="bg-white border-t border-slate-200/80 py-6 px-4 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto space-y-1.5">
          <p className="font-semibold text-slate-700">
            {poolConfig.leagueName} • {poolConfig.associationName} • 100% Proceeds to Protective Umpire Gear
          </p>
          <p className="text-[11px] text-slate-400">
            Inspired by the 1986 40-Year Umpire Tradition • Straight Up Picks • 1 Pt Per Win • MNF 1st-Place Tiebreaker
          </p>
        </div>
      </footer>

      {/* Global Help & Setup Modal */}
      <HelpModal isOpen={isGlobalHelpOpen} onClose={handleCloseHelpModal} />

      {/* Pool Setup Wizard Modal */}
      <SetupWizardModal
        isOpen={isSetupWizardOpen}
        onClose={handleCloseSetupWizard}
        initialConfig={poolConfig}
        players={players}
        onSaveConfig={handleCompleteSetup}
      />

      {/* Crew Chief's $1 Umpire Fine Jar Modal */}
      <UmpireFineJarModal
        isOpen={isFineJarOpen}
        onClose={handleCloseFineJarModal}
        fines={fines}
        players={players}
        onAddFine={handleAddFine}
        onTogglePaid={handleToggleFinePaid}
      />
    </div>
  );
}
