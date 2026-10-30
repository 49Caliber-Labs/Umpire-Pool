import { getSavedPoolConfig } from '../config/leagueConfig';

/**
 * Admin Hub and Dispatch Control PIN Security
 * Reads the dynamic 4-digit PIN configured in the Setup Wizard (defaults to 2233)
 */

export const ADMIN_PIN = '2233';
const SESSION_STORAGE_KEY = 'nfl_pool_admin_pin_unlocked_v1';

export function getActiveAdminPin(): string {
  try {
    const cfg = getSavedPoolConfig();
    if (cfg && cfg.adminPin && cfg.adminPin.trim().length === 4) {
      return cfg.adminPin.trim();
    }
  } catch (e) {}
  return ADMIN_PIN;
}

export function isAdminPinUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true';
  } catch (e) {
    return false;
  }
}

function notifyAdminAuthChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    if (typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('admin_auth_changed'));
    } else {
      const evt = document.createEvent('Event');
      evt.initEvent('admin_auth_changed', true, true);
      window.dispatchEvent(evt);
    }
  } catch (e) {
    try {
      const evt = document.createEvent('Event');
      evt.initEvent('admin_auth_changed', true, true);
      window.dispatchEvent(evt);
    } catch (err) {}
  }
}

export function setAdminPinUnlocked(unlocked: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (unlocked) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
      notifyAdminAuthChanged();
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      notifyAdminAuthChanged();
    }
  } catch (e) {}
}

export function verifyAdminPin(enteredPin: string): boolean {
  const clean = enteredPin.trim();
  const configuredPin = getActiveAdminPin();
  return clean === configuredPin || clean === ADMIN_PIN;
}
