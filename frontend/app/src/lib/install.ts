/**
 * "Install the app": keeps Chromium's deferred `beforeinstallprompt` event
 * app-wide, tracks `appinstalled`, and decides which install path applies on
 * this browser (native prompt, iOS Safari steps, or nothing).
 */
import { useSyncExternalStore } from 'react';
import { local } from './storage';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** prompt = Chromium install prompt · ios = Safari steps · ios-other = iOS but not Safari · installed · none. */
export type InstallVariant = 'prompt' | 'ios' | 'ios-other' | 'installed' | 'none';

const DISMISS_KEY = 'separame:install-dismissed-until';
const DISMISS_DAYS = 14;

interface State {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  /** Increments on `appinstalled` (for the one-time toast). */
  installedTick: number;
  override: InstallVariant | null;
}

let state: State = { deferred: null, installed: false, installedTick: 0, override: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function isStandaloneDisplay(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** Pure decision, unit-tested. */
export function detectVariant(input: { ua: string; standalone: boolean; hasPrompt: boolean; installed: boolean; maxTouchPoints?: number }): InstallVariant {
  if (input.standalone || input.installed) return 'installed';
  if (input.hasPrompt) return 'prompt';
  const iPadOs = /Macintosh/.test(input.ua) && (input.maxTouchPoints ?? 0) > 1;
  const ios = /iPhone|iPad|iPod/.test(input.ua) || iPadOs;
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(input.ua) ? 'ios-other' : 'ios';
  return 'none';
}

export const isMobileUa = (ua: string) => /iPhone|iPad|iPod|Android|Mobile/.test(ua);

/** Call once at boot, before React renders, so an early event isn't missed. */
export function captureInstallEvents(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    set({ deferred: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => set({ deferred: null, installed: true, installedTick: state.installedTick + 1 }));
}

export const installStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => state,
  /** Mock mode / tests: force a variant (and a fake prompt for 'prompt'). */
  override(variant: InstallVariant | null, fakePrompt?: BeforeInstallPromptEvent) {
    set({ override: variant, deferred: fakePrompt ?? state.deferred, installed: variant === 'installed' });
  },
  markInstalled() {
    set({ deferred: null, installed: true, installedTick: state.installedTick + 1, override: state.override === 'prompt' ? 'installed' : state.override });
  },
  async prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = state.deferred;
    if (!event) return 'unavailable';
    await event.prompt();
    const { outcome } = await event.userChoice;
    // A deferred prompt can only be used once.
    set({ deferred: null });
    return outcome;
  },
};

export function isDismissed(now = Date.now()): boolean {
  const until = Number(local.get(DISMISS_KEY) ?? 0);
  return until > now;
}

export function dismissInstall(now = Date.now()): void {
  local.set(DISMISS_KEY, String(now + DISMISS_DAYS * 86_400_000));
}

export function useInstall() {
  const s = useSyncExternalStore(installStore.subscribe, installStore.get, installStore.get);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const variant: InstallVariant =
    s.override ??
    detectVariant({ ua, standalone: isStandaloneDisplay(), hasPrompt: !!s.deferred, installed: s.installed, maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints });
  return { variant, installedTick: s.installedTick, mobile: s.override ? true : isMobileUa(ua) };
}
