import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import './index.css';
import { FatalError } from './app/Splash';
import { createRouter } from './app/router';
import { ToastProvider } from './components/ui/Toast';
import { ApiError } from './lib/api';
import { auth } from './lib/auth';
import { createAmplifyAuth } from './lib/amplifyAuth';
import { initAnalytics, trackPageView } from './lib/analytics';
import { keepAppUpdated } from './lib/appUpdates';
import { loadConfig } from './lib/config';
import { captureInstallEvents } from './lib/install';
import { reloadForStaleChunk } from './lib/staleChunks';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return count < 2;
      },
      refetchOnWindowFocus: true,
      staleTime: 20_000,
    },
  },
});
auth.onSignOut(() => queryClient.clear());

captureInstallEvents();
initAnalytics();
// Vite's module preload failed (chunk of a previous deploy): reload once instead of breaking the screen.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForStaleChunk((event as Event & { payload?: unknown }).payload)) event.preventDefault();
});

const root = createRoot(document.getElementById('root')!);

/** One page_view per distinct URL, once its (lazy) route has loaded. */
function measurePageViews(router: ReturnType<typeof createRouter>) {
  let measured = '';
  const measure = ({ pathname, search }: { pathname: string; search: string }) => {
    if (pathname + search === measured) return;
    measured = pathname + search;
    trackPageView();
  };
  measure(router.state.location);
  router.subscribe((state) => {
    if (state.navigation.state === 'idle') measure(state.location);
  });
}

async function boot() {
  if (__MOCK__) {
    const { installMocks } = await import('./mocks/install');
    installMocks();
  } else {
    const config = await loadConfig();
    void auth.init(createAmplifyAuth(config));
  }
  const router = createRouter();
  measurePageViews(router);
  keepAppUpdated(router);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

boot().catch(() => {
  root.render(<FatalError message="No pudimos cargar Sepárame. Revisa tu conexión y recarga la página." />);
});
