import {
  GA_MEASUREMENT_ID,
  analyticsEnabledFor,
  sanitizeLocation,
  sanitizeReferrer,
  type AnalyticsEventName,
  type AnalyticsEvents,
} from '@shared/analytics';

/**
 * Google Analytics 4 for the landing, the legal pages and the booking bundle
 * (rules in shared/analytics.ts). gtag.js is injected after the page's `load`
 * event so it never competes with the first paint; events sent before it
 * arrives wait in `dataLayer`.
 */

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let enabled = false;

function gtag(...args: unknown[]): void {
  window.gtag?.(...args);
}

export function initAnalytics(): void {
  if (enabled || !analyticsEnabledFor(location.hostname)) return;
  const pageLocation = sanitizeLocation(location.href);
  if (!pageLocation) return;
  enabled = true;
  window.dataLayer = window.dataLayer ?? [];
  // gtag.js reads the `arguments` object itself, not an array.
  window.gtag = function gtagShim() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: pageLocation,
    page_referrer: sanitizeReferrer(document.referrer, location.origin),
  });
  const load = () => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.append(script);
  };
  if (document.readyState === 'complete') load();
  else window.addEventListener('load', load, { once: true });
}

export function trackPageView(): void {
  if (!enabled) return;
  const pageLocation = sanitizeLocation(location.href);
  if (!pageLocation) return;
  gtag('set', { page_location: pageLocation });
  gtag('event', 'page_view', { page_location: pageLocation, page_title: document.title });
}

export function track<E extends AnalyticsEventName>(name: E, params: AnalyticsEvents[E]): void {
  if (enabled) gtag('event', name, params);
}

/** Tests only. */
export function resetAnalytics(): void {
  enabled = false;
  delete window.gtag;
  delete window.dataLayer;
}
