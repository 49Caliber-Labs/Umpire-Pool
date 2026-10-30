export type DispatchType = 'friday_morning' | 'sunday_night' | 'tuesday_morning';
export type DispatchCadence = 1 | 2 | 3;

export interface PoolSetupConfig {
  isConfigured: boolean;
  leagueName: string;
  associationName: string;
  seasonYear: number;
  buyInAmount: number;
  equipmentGoalDescription: string;
  equipmentGoalTarget: number;
  adminName: string;
  adminEmail: string;
  adminPin: string;
  crewChiefTitle: string;
  crewChiefName: string;
  dispatchCadence: DispatchCadence;
  dispatchTypes?: DispatchType[];
  enableElvisBot: boolean;
  elvisBotName: string;
  enableFineJar: boolean;
  fineJarTitle: string;
  startingWeek: number;
  updatedAt?: string;
}

export const DEFAULT_POOL_CONFIG: PoolSetupConfig = {
  isConfigured: false,
  leagueName: 'Umpire Gear NFL Pool',
  associationName: 'Youth Sports Umpire Equipment Fundraiser',
  seasonYear: new Date().getFullYear(),
  buyInAmount: 20,
  equipmentGoalDescription: 'New chest protectors, masks & shin guards for our volunteer umpires',
  equipmentGoalTarget: 400,
  adminName: 'Pool Admin',
  adminEmail: '',
  adminPin: '2233',
  crewChiefTitle: 'Umpire-in-Chief',
  crewChiefName: 'Umpire-in-Chief',
  dispatchCadence: 1,
  dispatchTypes: ['tuesday_morning'],
  enableElvisBot: true,
  elvisBotName: 'Elvis',
  enableFineJar: true,
  fineJarTitle: '$1 Umpire Fine Jar',
  startingWeek: 1,
};

export const CONFIG_STORAGE_KEY = 'umpire_pool_setup_config_v5';

export function getSavedPoolConfig(): PoolSetupConfig {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_POOL_CONFIG, ...parsed };
      }
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_POOL_CONFIG;
}

export function savePoolConfig(config: PoolSetupConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
  } catch (e) {
    // ignore
  }
}
