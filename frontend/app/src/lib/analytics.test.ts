import { afterEach, describe, expect, it, vi } from 'vitest';

const enabled = vi.hoisted(() => ({ value: false }));
vi.mock('@shared/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/analytics')>()),
  analyticsEnabledFor: () => enabled.value,
}));

const { initAnalytics, resetAnalytics, track, trackPageView } = await import('./analytics');

const calls = () => (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
const pageViews = () => calls().filter((c) => c[0] === 'event' && c[1] === 'page_view');

afterEach(() => {
  resetAnalytics();
  enabled.value = false;
  document.head.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
  history.replaceState(null, '', '/');
});

describe('analytics (panel)', () => {
  it('does nothing outside prod', () => {
    initAnalytics();
    track('login', { method: 'email' });
    expect(window.dataLayer).toBeUndefined();
  });

  it('masks client keys and never measures the admin area', () => {
    enabled.value = true;
    history.replaceState(null, '', '/app/clients/3fa9c0d1e2');
    initAnalytics();
    trackPageView();
    expect(JSON.stringify(pageViews())).toContain('/app/clients/[client]');
    expect(JSON.stringify(calls())).not.toContain('3fa9c0d1e2');

    history.replaceState(null, '', '/app/admin/pros/p1');
    trackPageView();
    expect(pageViews()).toHaveLength(1);
  });

  it('does not start at all on an admin page', () => {
    enabled.value = true;
    history.replaceState(null, '', '/app/admin');
    initAnalytics();
    track('login', { method: 'email' });
    expect(window.dataLayer).toBeUndefined();
  });
});
