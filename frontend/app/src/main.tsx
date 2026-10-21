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
import { loadConfig } from './lib/config';
import { captureInstallEvents } from './lib/install';

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

const root = createRoot(document.getElementById('root')!);

async function boot() {
  if (__MOCK__) {
    const { installMocks } = await import('./mocks/install');
    installMocks();
  } else {
    const config = await loadConfig();
    void auth.init(createAmplifyAuth(config));
  }
  const router = createRouter();
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
