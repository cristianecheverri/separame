import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepAppUpdated } from './appUpdates';

type Listener = (state: { location: { pathname: string; search: string } }) => void;

function fakeRouter(pathname = '/agenda') {
  const listeners: Listener[] = [];
  return {
    state: { location: { pathname, search: '' } },
    subscribe: (listener: Listener) => listeners.push(listener),
    go: (to: string) => listeners.forEach((l) => l({ location: { pathname: to, search: '' } })),
  };
}

function fakeServiceWorker(controlled: boolean) {
  const target = new EventTarget();
  const update = vi.fn(() => Promise.resolve());
  const sw = Object.assign(target, { controller: controlled ? {} : null, ready: Promise.resolve({ update }) });
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return { sw: target, update };
}

afterEach(() => {
  Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
  vi.useRealTimers();
});

describe('keepAppUpdated', () => {
  it('after a new version takes control, the next screen change reloads (and only then)', () => {
    const { sw } = fakeServiceWorker(true);
    const router = fakeRouter();
    const reload = vi.fn();
    keepAppUpdated(router, reload);

    router.go('/appointments');
    expect(reload).not.toHaveBeenCalled();

    sw.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled(); // nothing interrupts the current screen
    router.go('/appointments'); // same URL: no navigation
    expect(reload).not.toHaveBeenCalled();
    router.go('/clients');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('the first install is not an update', () => {
    const { sw } = fakeServiceWorker(false);
    const router = fakeRouter();
    const reload = vi.fn();
    keepAppUpdated(router, reload);
    sw.dispatchEvent(new Event('controllerchange'));
    router.go('/clients');
    expect(reload).not.toHaveBeenCalled();
  });

  it('checks for a new version when the app comes back to the foreground and every hour', async () => {
    vi.useFakeTimers();
    const { update } = fakeServiceWorker(true);
    keepAppUpdated(fakeRouter(), vi.fn());
    await Promise.resolve();
    await Promise.resolve();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does nothing without service workers', () => {
    expect(() => keepAppUpdated(fakeRouter(), vi.fn())).not.toThrow();
  });
});
