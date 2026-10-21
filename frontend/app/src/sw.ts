/// <reference lib="webworker" />
/**
 * Service worker of the panel (vite-plugin-pwa, injectManifest): precaches the
 * app shell, serves index.html for navigations and shows web push notices for
 * appointment events. Payload (JSON): { title, body, url, tag }.
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

const BASE = '/app/';

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${BASE}index.html`), { allowlist: [/^\/app\//], denylist: [/\/config\.json$/] }));

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

function readPayload(event: PushEvent): PushPayload {
  try {
    return (event.data?.json() as PushPayload) ?? {};
  } catch {
    return { body: event.data?.text() };
  }
}

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(data.title || 'Sepárame', {
      body: data.body ?? '',
      icon: `${BASE}pwa-192.png`,
      badge: `${BASE}badge-72.png`,
      tag: data.tag,
      lang: 'es-CO',
      data: { url: data.url || BASE },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data as { url?: string } | null)?.url || BASE, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const panel = windows.find((w) => new URL(w.url).pathname.startsWith(BASE));
      if (panel) {
        await panel.focus();
        if (panel.url !== target) await panel.navigate(target).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
