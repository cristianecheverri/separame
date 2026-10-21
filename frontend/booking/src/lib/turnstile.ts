/**
 * Cloudflare Turnstile, loaded lazily (only on the review step) so it costs
 * nothing until the client is about to book.
 */
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export interface TurnstileOptions {
  sitekey: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
  language?: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
