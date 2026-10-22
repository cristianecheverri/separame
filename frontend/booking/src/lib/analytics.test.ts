import { afterEach, describe, expect, it, vi } from 'vitest';

const enabled = vi.hoisted(() => ({ value: false }));
vi.mock('@shared/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/analytics')>()),
  analyticsEnabledFor: () => enabled.value,
}));

const { initAnalytics, resetAnalytics, track, trackPageView } = await import('./analytics');

/** dataLayer entries as plain arrays (gtag pushes `arguments` objects). */
const calls = () => (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));

afterEach(() => {
  resetAnalytics();
  enabled.value = false;
  document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
  history.replaceState(null, '', '/');
});

describe('analytics (booking)', () => {
  it('does nothing outside prod', () => {
    initAnalytics();
    trackPageView();
    track('booking_view', { pro_slug: 'ana' });
    expect(window.dataLayer).toBeUndefined();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it('in prod: configures gtag without signals or the automatic page view, then loads it', () => {
    enabled.value = true;
    initAnalytics();
    const config = calls().find((c) => c[0] === 'config');
    expect(config?.[1]).toBe('G-48XHR8L6CY');
    expect(config?.[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
    // jsdom has already fired `load`.
    expect(document.querySelector('script[src="https://www.googletagmanager.com/gtag/js?id=G-48XHR8L6CY"]')).not.toBeNull();
  });

  it('never sends the manage token in a page view', () => {
    enabled.value = true;
    history.replaceState(null, '', '/c/secret-token-123?action=confirm');
    initAnalytics();
    trackPageView();
    const sent = JSON.stringify(calls());
    expect(sent).not.toContain('secret-token-123');
    expect(sent).toContain('/c/[token]');
    expect(calls().find((c) => c[0] === 'event' && c[1] === 'page_view')).toBeDefined();
  });

  it('sends typed events', () => {
    enabled.value = true;
    initAnalytics();
    track('booking_confirmed', { pro_slug: 'ana', has_email: 'no' });
    expect(calls()).toContainEqual(['event', 'booking_confirmed', { pro_slug: 'ana', has_email: 'no' }]);
  });
});
