/**
 * Session store over an AuthClient: who is signed in, the ID token for the API
 * (the SDK refreshes it) and a tiny subscribe API for React.
 */
import { useSyncExternalStore } from 'react';
import type { AuthClient } from './authClient';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  email: string | null;
}

let state: AuthState = { status: 'loading', email: null };
const listeners = new Set<() => void>();
const signOutListeners = new Set<() => void>();
let client: AuthClient | null = null;

function setState(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Reads the payload of a JWT (no verification — the API verifies it). */
export function decodeJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function sync(): Promise<void> {
  const token = client ? await client.getIdToken() : null;
  if (!token) {
    setState({ status: 'signedOut', email: null });
    return;
  }
  const email = decodeJwt(token).email;
  setState({ status: 'signedIn', email: typeof email === 'string' ? email : null });
}

async function signOut(): Promise<void> {
  try {
    await client?.signOut();
  } catch {
    /* the local session is cleared either way */
  }
  setState({ status: 'signedOut', email: null });
  signOutListeners.forEach((l) => l());
}

export const auth = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  onSignOut(listener: () => void) {
    signOutListeners.add(listener);
    return () => signOutListeners.delete(listener);
  },
  get client(): AuthClient {
    if (!client) throw new Error('Auth not initialized');
    return client;
  },
  /** Restores the session (if any) from the SDK's storage. */
  async init(authClient: AuthClient): Promise<void> {
    client = authClient;
    await sync();
  },
  /** Call after a flow finished signing in. */
  refresh: sync,
  async getIdToken(): Promise<string | null> {
    return client ? client.getIdToken() : null;
  },
  /** After a 401: force a token refresh once; false means give up. */
  async forceRefresh(): Promise<boolean> {
    return !!(client && (await client.getIdToken(true)));
  },
  signOut,
};

export function useAuth(): AuthState {
  return useSyncExternalStore(auth.subscribe, auth.getState, auth.getState);
}
