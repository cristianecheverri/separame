/**
 * Moves long-open tabs and installed apps to the latest deploy without
 * interrupting anyone. The service worker (sw.ts) already activates a new
 * version right away (skipWaiting + clientsClaim), but the page keeps running
 * the code it loaded. So:
 *  - look for a new service worker every hour and whenever the app comes back
 *    to the foreground (browsers alone may wait up to a day);
 *  - once a new one has taken control, the next screen change is a full page
 *    load: the person was leaving the screen anyway, so nothing typed is lost.
 */

const CHECK_EVERY_MS = 60 * 60 * 1000;

interface RouterLike {
  state: { location: { pathname: string; search: string } };
  subscribe: (listener: (state: { location: { pathname: string; search: string } }) => void) => unknown;
}

export function keepAppUpdated(router: RouterLike, reload: () => void = () => window.location.reload()): void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw) return;

  // The first install also fires `controllerchange` (clientsClaim): only a replacement is an update.
  let controlled = Boolean(sw.controller);
  let updateReady = false;
  sw.addEventListener('controllerchange', () => {
    if (controlled) updateReady = true;
    controlled = true;
  });

  void sw.ready.then((registration) => {
    const check = () => void registration.update().catch(() => undefined);
    setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  });

  const urlOf = ({ pathname, search }: { pathname: string; search: string }) => pathname + search;
  let current = urlOf(router.state.location);
  router.subscribe((state) => {
    const next = urlOf(state.location);
    if (next === current) return;
    current = next;
    // The router already moved to the new URL: loading it again brings the new build.
    if (updateReady) reload();
  });
}
