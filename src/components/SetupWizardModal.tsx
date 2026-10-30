import React, { useState, useEffect, useMemo, memo } from 'react';
import {
  Shield,
  Mail,
  Check,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Scale,
  DollarSign,
  Coins,
  Heart,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { PoolSetupConfig, DEFAULT_POOL_CONFIG, DispatchCadence } from '../config/leagueConfig';
import { Player } from '../types';

interface SetupWizardModalProps {
  isOpen: boolean;
  initialConfig: PoolSetupConfig;
  players?: Player[];
  initialPlayers?: Player[];
  onSaveConfig?: (config: PoolSetupConfig, players: Player[]) => Promise<void> | void;
  onCompleteSetup?: (config: PoolSetupConfig, players: Player[]) => Promise<void> | void;
  onClose?: () => void;
}

const FAKE_DEMO_IDS = new Set<string>([]);

export const SetupWizardModal: React.FC<SetupWizardModalProps> = memo(({
  isOpen,
  initialConfig,
  players,
  initialPlayers,
  onSaveConfig,
  onCompleteSetup,
  onClose
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingLiveWeek, setIsCheckingLiveWeek] = useState(false);
  const [showMidseasonConfirm, setShowMidseasonConfirm] = useState(false);

  // Step 2: League & Equipment Fund Settings
  const [leagueName, setLeagueName] = useState(initialConfig.leagueName || DEFAULT_POOL_CONFIG.leagueName);
  const [associationName, setAssociationName] = useState(initialConfig.associationName || DEFAULT_POOL_CONFIG.associationName);
  const [buyInAmount, setBuyInAmount] = useState(initialConfig.buyInAmount || 20);
  const [equipmentGoalDescription, setEquipmentGoalDescription] = useState(
    initialConfig.equipmentGoalDescription || DEFAULT_POOL_CONFIG.equipmentGoalDescription
  );
  const [adminName, setAdminName] = useState(() => {
    const raw = initialConfig.adminName;
    if (!raw || raw === 'Crew Chief') return DEFAULT_POOL_CONFIG.adminName;
    return raw;
  });
  const [adminEmail, setAdminEmail] = useState(() => {
    const raw = initialConfig.adminEmail;
    if (!raw) return DEFAULT_POOL_CONFIG.adminEmail;
    return raw;
  });
  const [crewChiefName, setCrewChiefName] = useState(() => {
    const raw = initialConfig.crewChiefName;
    if (!raw) return DEFAULT_POOL_CONFIG.crewChiefName;
    return raw;
  });
  const [adminPin, setAdminPin] = useState(initialConfig.adminPin || '2233');
  const [detectedEspnWeek, setDetectedEspnWeek] = useState<number>(6);

  // Step 3: Weekly Dispatches & Pool Options
  const [dispatchCadence, setDispatchCadence] = useState<DispatchCadence>(initialConfig.dispatchCadence || 1);
  const [enableElvisBot, setEnableElvisBot] = useState(initialConfig.enableElvisBot !== false);
  const [elvisBotName, setElvisBotName] = useState(initialConfig.elvisBotName || 'Elvis');
  const [enableFineJar, setEnableFineJar] = useState(initialConfig.enableFineJar !== false);
  const [fineJarTitle, setFineJarTitle] = useState(initialConfig.fineJarTitle || '$1 Umpire Fine Jar');

  // Step 4: Additional Contenders (Main Pool Admin is ALWAYS automatically Contender #1 on the roster)
  const [otherContenders, setOtherContenders] = useState<Player[]>(() => {
    const sourceList = players || initialPlayers || [];
    const currentAdminNameLower = (initialConfig.adminName && initialConfig.adminName !== 'Crew Chief'
      ? initialConfig.adminName
      : DEFAULT_POOL_CONFIG.adminName).trim().toLowerCase();

    return sourceList.filter(p =>
      p.isActive !== false &&
      !FAKE_DEMO_IDS.has(p.id) &&
      !p.isElvis &&
      p.id !== 'elvis' &&
      p.id !== 'admin-main' &&
      p.role !== 'admin' &&
      p.name.trim().toLowerCase() !== currentAdminNameLower
    );
  });

  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerTagline, setNewPlayerTagline] = useState('');

  // Auto-detect authoritative live NFL week on open
  useEffect(() => {
    if (!isOpen) return;
    setShowMidseasonConfirm(false);
    fetch('/api/nfl/live-week')
      .then(r => r.json())
      .then(data => {
        if (data?.detectedWeek && typeof data.detectedWeek === 'number') {
          setDetectedEspnWeek(data.detectedWeek);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Guaranteed #1 Contender: Pool Admin who set everything up
  const adminContender: Player = useMemo(() => {
    const cleanAdminName = adminName.trim() || 'Pool Admin';
    const cleanAdminEmail = adminEmail.trim() || 'admin@example.org';
    return {
      id: cleanAdminName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'admin-main',
      name: cleanAdminName,
      email: cleanAdminEmail,
      role: 'admin',
      tagline: 'Pool Admin & Contender',
      isActive: true,
      paid: true
    };
  }, [adminName, adminEmail]);

  // Complete combined roster (Pool Admin #1 + added contenders)
  const fullHumanRoster: Player[] = useMemo(() => {
    const adminNameLower = adminContender.name.toLowerCase();
    const dedupedOthers = otherContenders.filter(
      p => p.name.trim().toLowerCase() !== adminNameLower
    );
    return [adminContender, ...dedupedOthers];
  }, [adminContender, otherContenders]);

  if (!isOpen) return null;

  const humanContendersCount = fullHumanRoster.length;
  const projectedFundTotal = humanContendersCount * (Number(buyInAmount) || 20);

  const handleAddContender = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newPlayerName.trim();
    if (!cleanName) return;

    // Prevent duplicating the Admin or an existing contender
    if (fullHumanRoster.some(p => p.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      setNewPlayerName('');
      setNewPlayerEmail('');
      setNewPlayerTagline('');
      return;
    }

    const id = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString().slice(-3);
    const newPlayer: Player = {
      id,
      name: cleanName,
      email: newPlayerEmail.trim() || `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
      role: 'player',
      tagline: newPlayerTagline.trim() || 'League Contender & Supporter',
      isActive: true,
      paid: true
    };

    setOtherContenders(prev => [...prev, newPlayer]);
    setNewPlayerName('');
    setNewPlayerEmail('');
    setNewPlayerTagline('');
  };

  const handleRemoveContender = (id: string) => {
    setOtherContenders(prev => prev.filter(p => p.id !== id));
  };

  const handleClearAdditionalContenders = () => {
    setOtherContenders([]);
  };

  // Step 1 of Launch: Scrape live NFL week and prompt if midseason (> Week 1)
  const handleInitiateLaunch = async () => {
    setIsCheckingLiveWeek(true);
    let liveWeek = detectedEspnWeek || 6;
    try {
      const res = await fetch('/api/nfl/live-week');
      if (res.ok) {
        const data = await res.json();
        if (data?.detectedWeek && typeof data.detectedWeek === 'number') {
          liveWeek = data.detectedWeek;
          setDetectedEspnWeek(liveWeek);
        }
      }
    } catch (e) {}
    setIsCheckingLiveWeek(false);

    // If NFL season is already underway (Week > 1), require explicit Yes/No confirmation
    if (liveWeek > 1) {
      setShowMidseasonConfirm(true);
    } else {
      await executeFinalLaunch(liveWeek);
    }
  };

  // Step 2 of Launch: Execute confirmed launch with Admin guaranteed at #1 on roster
  const executeFinalLaunch = async (confirmedWeek: number) => {
    setIsSaving(true);
    setShowMidseasonConfirm(false);
    try {
      const cleanPin = adminPin.replace(/\D/g, '').slice(0, 4).padEnd(4, '0');
      const finalRoster: Player[] = [...fullHumanRoster];

      // Add Elvis bot if enabled
      if (enableElvisBot) {
        finalRoster.push({
          id: 'elvis',
          name: elvisBotName.trim() || 'Elvis',
          email: 'elvis@poollegend.com',
          role: 'player',
          isElvis: true,
          tagline: 'Honorary Permanent Member • Vegas Favorites',
          isActive: true
        });
      }

      const finalConfig: PoolSetupConfig = {
        isConfigured: true,
        leagueName: leagueName.trim() || DEFAULT_POOL_CONFIG.leagueName,
        associationName: associationName.trim() || DEFAULT_POOL_CONFIG.associationName,
        seasonYear: new Date().getFullYear(),
        buyInAmount: Number(buyInAmount) || 20,
        equipmentGoalDescription: equipmentGoalDescription.trim() || DEFAULT_POOL_CONFIG.equipmentGoalDescription,
        equipmentGoalTarget: projectedFundTotal > 0 ? projectedFundTotal : 400,
        adminName: adminContender.name,
        adminEmail: adminContender.email,
        adminPin: cleanPin,
        crewChiefTitle: 'Umpire-in-Chief',
        crewChiefName: crewChiefName.trim() || adminContender.name,
        dispatchCadence,
        enableElvisBot,
        elvisBotName: elvisBotName.trim() || 'Elvis',
        enableFineJar,
        fineJarTitle: fineJarTitle.trim() || '$1 Umpire Equipment Jar',
        startingWeek: confirmedWeek,
        updatedAt: new Date().toISOString()
      };

      const callback = onSaveConfig || onCompleteSetup;
      if (callback) {
        await callback(finalConfig, finalRoster);
      }
      if (onClose) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border-2 border-emerald-800 overflow-hidden my-auto relative">
        {/* Top Banner */}
        <div className="bg-gradient-to-r from-[#1b3a2b] via-[#142d21] to-[#1b3a2b] text-white px-5 py-4 border-b border-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center text-xl font-black shadow-inner">
              ⚾
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  Umpire Equipment Fundraiser Template
                </span>
                <span className="text-[10px] bg-emerald-800 text-emerald-100 px-2 py-0.5 rounded font-semibold">
                  Step {step} of 4
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                {step === 1 && 'Welcome & The 40-Year Umpire Pool Story'}
                {step === 2 && 'League Identity & Equipment Fund Goal'}
                {step === 3 && 'Weekly Email Dispatches & Pool Traditions'}
                {step === 4 && 'Contender Roster & Launch Pool'}
              </h2>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-emerald-900/80 hover:bg-emerald-800 text-emerald-100 text-xs font-bold border border-emerald-700 cursor-pointer"
            >
              Close Wizard
            </button>
          )}
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-4 bg-slate-100 border-b border-slate-200 text-xs font-bold">
          {[
            { num: 1, label: '1. The Story' },
            { num: 2, label: '2. League & Gear' },
            { num: 3, label: '3. Emails & Rules' },
            { num: 4, label: '4. Roster & Launch' }
          ].map(s => (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                setShowMidseasonConfirm(false);
                setStep(s.num as 1 | 2 | 3 | 4);
              }}
              className={`py-2.5 px-2 text-center border-b-2 transition-colors cursor-pointer ${
                step === s.num
                  ? 'border-emerald-700 bg-white text-emerald-950 font-black'
                  : step > s.num
                    ? 'border-emerald-500/50 bg-emerald-50/50 text-emerald-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Wizard Body */}
        <div className="p-5 sm:p-6 max-h-[72vh] overflow-y-auto space-y-5">
          {/* STEP 1: WELCOME & ORIGIN STORY */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-emerald-950 to-[#1b3a2b] text-white p-5 rounded-xl border border-emerald-800 space-y-3">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                  <Heart className="w-4 h-4 fill-amber-300" />
                  <span>How a 1986 Little League Umpire Crew Started It All</span>
                </div>
                <p className="text-sm text-emerald-100 leading-relaxed">
                  Forty years ago in 1986, a dedicated group of volunteer Little League parents and umpires faced a familiar problem in youth baseball: league budgets are tight, and volunteer umpires rarely get new or safe protective gear.
                </p>
                <p className="text-sm text-emerald-100 leading-relaxed">
                  To help fund the equipment locker, the crew started a simple, friendly neighborhood NFL Pick&rsquo;em Pool. About 20 friends, family members, and league volunteers chipped in <strong>$20 for the entire 18-week season</strong>. There were no point spreads, no gambling payouts, and no complicated math—just picking outright winners for weekly bragging rights, while <strong>100% of the $400 raised went straight toward buying new chest protectors, masks, and shin guards</strong> for the umpires.
                </p>
                <p className="text-sm text-amber-200/95 italic bg-emerald-900/60 p-3 rounded-lg border border-emerald-700/60">
                  After four decades of running that pool by hand, this autonomous digital edition was built as a free template so Little League umpire crews and youth sports volunteers anywhere in the country can run their own self-driving fundraiser with zero fees.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 mb-1">
                    <DollarSign className="w-4 h-4 text-emerald-700" />
                    <span>100% Gear Fundraiser</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    No cash prizes or gambling. A single $20 season buy-in per contender funds your umpire equipment locker.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 mb-1">
                    <Scale className="w-4 h-4 text-emerald-700" />
                    <span>Straight-Up Winners</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    1 point per correct pick. No point spreads. Monday Night Football total points breaks 1st-place weekly ties only.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4 text-emerald-700" />
                    <span>Runs Autonomously</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    The Master Timeclock scrapes live ESPN scores, odds, and injuries, grades the spreadsheet, and drafts your weekly emails.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: LEAGUE IDENTITY & EQUIPMENT GOAL */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pool Title (Displayed in Header & Emails)
                  </label>
                  <input
                    type="text"
                    value={leagueName}
                    onChange={e => setLeagueName(e.target.value)}
                    placeholder="e.g. District 12 Umpire Gear NFL Pool"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:outline-none focus:border-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Little League / Umpire Association Name
                  </label>
                  <input
                    type="text"
                    value={associationName}
                    onChange={e => setAssociationName(e.target.value)}
                    placeholder="e.g. Oak Grove Little League Umpires"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-emerald-50/70 rounded-xl border border-emerald-200">
                <div>
                  <label className="block text-xs font-bold text-emerald-950 mb-1">
                    Season Buy-In Per Contender ($)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={buyInAmount}
                    onChange={e => setBuyInAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm font-bold text-emerald-950 focus:outline-none focus:border-emerald-700"
                  />
                  <span className="text-[11px] text-emerald-800 mt-0.5 block">
                    Classic tradition: $20 for the full season
                  </span>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-emerald-950 mb-1">
                    What Equipment Are You Raising Money For?
                  </label>
                  <input
                    type="text"
                    value={equipmentGoalDescription}
                    onChange={e => setEquipmentGoalDescription(e.target.value)}
                    placeholder="e.g. New Chest Protectors, Masks, Shin Guards & Plate Brushes"
                    className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-emerald-700"
                  />
                  <span className="text-[11px] text-emerald-800 mt-0.5 block">
                    20 contenders at ${buyInAmount || 20} = <strong>${(Number(buyInAmount) || 20) * 20}</strong> for your umpire gear locker.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Your Name (Main Pool Admin &amp; #1 Contender on Roster)
                  </label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={e => setAdminName(e.target.value)}
                    placeholder="e.g. Coach Mike"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:outline-none focus:border-emerald-700"
                  />
                  <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">
                    ✓ Automatically added to the active contender roster
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Your Admin Contact Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    placeholder="e.g. admin@littleleague.org"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:outline-none focus:border-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Umpire-in-Chief / Crew Chief Name
                  </label>
                  <input
                    type="text"
                    value={crewChiefName}
                    onChange={e => setCrewChiefName(e.target.value)}
                    placeholder="e.g. Umpire-in-Chief"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold focus:outline-none focus:border-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    4-Digit Admin PIN
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={adminPin}
                    onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="2233"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono font-bold focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: EMAIL DISPATCH FREQUENCY & TRADITIONS */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
                  Choose Weekly Email Dispatch Frequency (Autonomous Master Timeclock)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Option 1: 1 Email/Week */}
                  <button
                    type="button"
                    onClick={() => setDispatchCadence(1)}
                    className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                      dispatchCadence === 1
                        ? 'border-emerald-700 bg-emerald-50/70 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-black text-sm text-slate-900">1 Email / Week</span>
                        {dispatchCadence === 1 && <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-800 mb-2">
                        Low-Traffic Minimalist
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Sends only the <strong>Tuesday Morning Final</strong>: crowns the weekly champion, locks the season standings, and drops the next week&rsquo;s matchups.
                      </p>
                    </div>
                  </button>

                  {/* Option 2: 2 Emails/Week */}
                  <button
                    type="button"
                    onClick={() => setDispatchCadence(2)}
                    className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                      dispatchCadence === 2
                        ? 'border-emerald-700 bg-emerald-50/70 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-black text-sm text-slate-900">2 Emails / Week</span>
                        {dispatchCadence === 2 && <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
                      </div>
                      <div className="text-[11px] font-bold text-amber-800 mb-2">
                        1986 Two-Edition Classic
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Sends the <strong>Sunday Night Recap</strong> (entering MNF with tiebreaker stakes) + the <strong>Tuesday Morning Final</strong> crown.
                      </p>
                    </div>
                  </button>

                  {/* Option 3: 3 Emails/Week */}
                  <button
                    type="button"
                    onClick={() => setDispatchCadence(3)}
                    className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                      dispatchCadence === 3
                        ? 'border-emerald-700 bg-emerald-50/70 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-black text-sm text-slate-900">3 Emails / Week</span>
                        {dispatchCadence === 3 && <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-900 mb-2">
                        Full Autonomous Suite
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Adds the <strong>Friday Wire</strong> (Thursday recap + scrubbed NFL Injury Report) alongside the <strong>Sunday Night Recap</strong> and <strong>Tuesday Final</strong>.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Optional Pool Traditions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Elvis Vegas Favorites Bot */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🕶️</span>
                      <span className="font-bold text-xs sm:text-sm text-slate-900">
                        Honorary Vegas Favorites Bot
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableElvisBot}
                      onChange={e => setEnableElvisBot(e.target.checked)}
                      className="w-4 h-4 accent-emerald-700 cursor-pointer"
                    />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    In the original 1986 pool, a fellow volunteer umpire sponsored a spot for <strong>Elvis</strong>. Today, the Timeclock automatically assigns him the official Vegas favorites every week to keep the human contenders honest!
                  </p>
                  {enableElvisBot && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Bot Contender Name:
                      </label>
                      <input
                        type="text"
                        value={elvisBotName}
                        onChange={e => setElvisBotName(e.target.value)}
                        placeholder="Elvis"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                      />
                    </div>
                  )}
                </div>

                {/* $1 Umpire Fine Jar */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-600" />
                      <span className="font-bold text-xs sm:text-sm text-slate-900">
                        $1 Umpire Equipment Fine Jar
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableFineJar}
                      onChange={e => setEnableFineJar(e.target.checked)}
                      className="w-4 h-4 accent-emerald-700 cursor-pointer"
                    />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Lets the Crew Chief issue friendly $1 fines for arguing with the umpire, whining about Monday Night Football, or cellar-dwelling—adding extra bucks straight into the gear jar.
                  </p>
                  {enableFineJar && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Fine Jar Label:
                      </label>
                      <input
                        type="text"
                        value={fineJarTitle}
                        onChange={e => setFineJarTitle(e.target.value)}
                        placeholder="$1 Umpire Equipment Jar"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: CONTENDER ROSTER & LAUNCH */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                <div>
                  <div className="text-xs font-black text-emerald-950">
                    Contender Roster ({humanContendersCount} Human {humanContendersCount === 1 ? 'Contender' : 'Contenders'}{enableElvisBot ? ' + Elvis Bot' : ''} • ${projectedFundTotal} Equipment Fund)
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    You ({adminContender.name}) are automatically Contender #1 on the roster. Add your fellow umpires and supporters below.
                  </div>
                </div>
                {otherContenders.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAdditionalContenders}
                    className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 text-xs font-bold cursor-pointer shadow-2xs"
                  >
                    Clear Added Contenders
                  </button>
                )}
              </div>

              {/* Add Contender Form */}
              <form onSubmit={handleAddContender} className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <input
                  type="text"
                  placeholder="Contender Name (e.g. Umpire Bob)"
                  value={newPlayerName}
                  onChange={e => setNewPlayerName(e.target.value)}
                  className="sm:col-span-4 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                />
                <input
                  type="email"
                  placeholder="Email Address (for weekly dispatches)"
                  value={newPlayerEmail}
                  onChange={e => setNewPlayerEmail(e.target.value)}
                  className="sm:col-span-4 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                />
                <input
                  type="text"
                  placeholder="Role/Tagline (e.g. Plate Umpire)"
                  value={newPlayerTagline}
                  onChange={e => setNewPlayerTagline(e.target.value)}
                  className="sm:col-span-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                />
                <button
                  type="submit"
                  className="sm:col-span-2 px-3 py-2 rounded-lg bg-[#1b3a2b] hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>

              {/* Roster List (Admin is always #1) */}
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {fullHumanRoster.map((p, idx) => {
                  const isMainAdmin = idx === 0 || p.role === 'admin';
                  return (
                    <div
                      key={p.id}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs ${
                        isMainAdmin ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[10px] text-slate-400 w-5">{idx + 1}.</span>
                        <span className="font-black text-slate-900 truncate">{p.name}</span>
                        {isMainAdmin && (
                          <span className="text-[10px] bg-[#1b3a2b] text-amber-300 px-2 py-0.5 rounded font-black">
                            Pool Admin (You)
                          </span>
                        )}
                        <span className="text-slate-500 truncate hidden sm:inline">• {p.email}</span>
                        {p.tagline && !isMainAdmin && (
                          <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded hidden md:inline">
                            {p.tagline}
                          </span>
                        )}
                      </div>
                      {isMainAdmin ? (
                        <span className="text-[10px] font-bold text-emerald-800 px-2 py-0.5 bg-emerald-100 rounded">
                          Locked on Roster
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveContender(p.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Remove contender"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {enableElvisBot && (
                  <div className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs bg-amber-50/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] text-slate-400 w-5">{fullHumanRoster.length + 1}.</span>
                      <span className="font-bold text-slate-900 truncate">{elvisBotName.trim() || 'Elvis'}</span>
                      <span className="text-[10px] bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded font-bold">
                        🕶️ Vegas Favorites Bot
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-900 font-semibold">Auto-Picks Favorites</span>
                  </div>
                )}
              </div>

              {/* Midseason Confirmation Prompt (Appears when Admin clicks Launch and live NFL season is already underway) */}
              {showMidseasonConfirm && (
                <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 shadow-md space-y-3 animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 mt-0.5">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-black text-slate-950">
                        NFL Season Already Underway! (Live Schedule: NFL Week {detectedEspnWeek})
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed">
                        Live NFL data shows the regular season is already underway in <strong>Week {detectedEspnWeek}</strong>. Are you sure you want to launch the football pool midseason starting at <strong>Week {detectedEspnWeek}</strong>?
                      </p>
                      <p className="text-[11px] text-amber-900 font-medium">
                        • Completed Weeks 1–{detectedEspnWeek - 1} will be cleanly bypassed in the Season Standings Vault.<br />
                        • Official ESPN Week {detectedEspnWeek} matchups, team records, and Vegas spreads will be loaded for your {humanContendersCount}-contender roster.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setShowMidseasonConfirm(false)}
                      className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold cursor-pointer"
                    >
                      No, Go Back
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => executeFinalLaunch(detectedEspnWeek)}
                      className="px-5 py-2 rounded-lg bg-[#1b3a2b] hover:bg-emerald-800 text-amber-300 border border-emerald-950 text-xs font-black inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSaving ? 'Launching Midseason Pool...' : `Yes, Launch Pool Midseason (Week ${detectedEspnWeek})`}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Wizard Footer Navigation */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setShowMidseasonConfirm(false);
                  setStep((step - 1) as 1 | 2 | 3 | 4);
                }}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous Step</span>
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 font-medium">
                Free Open Template • No Subscriptions or Fees
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
                className="px-5 py-2.5 rounded-xl bg-[#1b3a2b] hover:bg-emerald-800 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : !showMidseasonConfirm ? (
              <button
                type="button"
                disabled={isSaving || isCheckingLiveWeek}
                onClick={handleInitiateLaunch}
                className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500 text-xs sm:text-sm font-black inline-flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>
                  {isCheckingLiveWeek
                    ? 'Checking Live NFL Schedule...'
                    : isSaving
                      ? 'Launching Pool & Syncing ESPN...'
                      : 'Complete Setup & Launch Umpire Pool'}
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});
