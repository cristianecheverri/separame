/**
 * Web push on this device: permission, PushManager subscription and a device
 * label. Behind a small adapter so mock mode and tests can fake the browser.
 */
import type { PushSubscriptionRequest } from '@shared/api';

export type PushPermission = NotificationPermission | 'unsupported';

export interface PushAdapter {
  supported(): boolean;
  permission(): PushPermission;
  /** Endpoint of this device's current subscription, if any. */
  currentEndpoint(): Promise<string | null>;
  /** Asks for permission and subscribes; throws `PushError`. */
  subscribe(vapidPublicKey: string): Promise<PushSubscriptionRequest>;
  /** Unsubscribes; returns the endpoint that was removed. */
  unsubscribe(): Promise<string | null>;
}

export class PushError extends Error {
  constructor(readonly reason: 'denied' | 'no_worker' | 'failed') {
    super(reason);
  }
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** "iPhone · Safari", "Android · Chrome", "Mac · Chrome"… */
export function deviceLabel(ua: string = navigator.userAgent): string {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Este dispositivo';
  const browser = /EdgA?\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /Firefox|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'Navegador';
  return `${device} · ${browser}`;
}

export const isIos = (ua: string = navigator.userAgent) => /iPhone|iPad|iPod/.test(ua);

export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
}

export const browserPush: PushAdapter = {
  supported: () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  permission: () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
  async currentEndpoint() {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  },
  async subscribe(vapidPublicKey) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new PushError('denied');
    const reg = await registration();
    if (!reg) throw new PushError('no_worker');
    try {
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const json = sub.toJSON();
      return { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' }, deviceLabel: deviceLabel() };
    } catch {
      throw new PushError('failed');
    }
  },
  async unsubscribe() {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return null;
    await sub.unsubscribe();
    return sub.endpoint;
  },
};

let adapter: PushAdapter = browserPush;
export const push = {
  get: () => adapter,
  set: (next: PushAdapter) => {
    adapter = next;
  },
};

/** SHA-256 hex of the endpoint — how the API identifies devices (`endpointHash`). */
export async function endpointHash(endpoint: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
