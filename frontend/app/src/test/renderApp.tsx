import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../app/router';
import { ToastProvider } from '../components/ui/Toast';
import { setTransport } from '../lib/api';
import { resetActingSelection } from '../lib/actingPro';
import { auth } from '../lib/auth';
import { pinClock } from '../lib/clock';
import { MOCK_NOW, type BillingMockState, type MockState, type TeamMockState } from '../mocks/fixtures';
import { mockAuthClient, mockPushAdapter } from '../mocks/install';
import { push } from '../lib/push';
import { installStore } from '../lib/install';
import { mockTransport, resetMockDb } from '../mocks/mockApi';

interface Options {
  state?: MockState;
  admin?: boolean;
  signedIn?: boolean;
  billing?: BillingMockState;
  team?: TeamMockState;
}

/** Renders the whole app at `path` against the in-memory mock API. */
export async function renderApp(path: string, { state = 'trial', admin = false, signedIn = true, billing = 'none', team = 'none' }: Options = {}) {
  pinClock(MOCK_NOW);
  resetMockDb({ state, isAdmin: admin, billing, team });
  resetActingSelection();
  setTransport((req) => mockTransport(req, 0));
  push.set(mockPushAdapter());
  installStore.override(null);
  localStorage.clear();
  await auth.init(mockAuthClient(signedIn ? 'laura@consultoriolaura.co' : null));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router };
}
