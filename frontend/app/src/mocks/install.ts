/**
 * Mock mode bootstrap (VITE_MOCK=1, dev server only): in-memory API, fake
 * Cognito, clock pinned to the mockups' day. Query switches (remembered for
 * the tab): ?as=admin | ?as=pro | ?as=guest, ?state=trial|active|grace|expired|onboarding,
 * ?billing=none|pending|rejected, ?install=android|ios|ios-other|installed|none,
 * ?team=none|pending|rejected|approved|seats (team plan: Consultorio Sonríe with Julián
 * and Sara; «approved» uses its 2 of 2 seats, «seats» has one free), ?delay=<ms>.
 */
import { setTransport } from '../lib/api';
import { auth } from '../lib/auth';
import { pinClock } from '../lib/clock';
import type { AuthClient } from '../lib/authClient';
import { deviceLabel, push, type PushAdapter } from '../lib/push';
import { installStore, type BeforeInstallPromptEvent, type InstallVariant } from '../lib/install';
import { session } from '../lib/storage';
import { MOCK_NOW, type BillingMockState, type MockState, type TeamMockState } from './fixtures';
import { mockTransport, resetMockDb } from './mockApi';

const STATES: MockState[] = ['trial', 'active', 'grace', 'expired', 'onboarding'];

function param(name: string, allowed: string[], fallback: string): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get(name);
  if (fromUrl && allowed.includes(fromUrl)) {
    session.set(`mock:${name}`, fromUrl);
    return fromUrl;
  }
  return session.get(`mock:${name}`) ?? fallback;
}

function fakeJwt(email: string): string {
  const b64 = (v: object) => btoa(JSON.stringify(v)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none' })}.${b64({ email, exp: 4102444800 })}.mock`;
}

const fail = (name: string) => Object.assign(new Error(name), { name });

/**
 * Fake Cognito. Any email/password signs in, except: password "incorrecta" →
 * wrong credentials; emails starting with "nuevo" → unconfirmed account;
 * "invitado@…" → temporary password (new password required); code "000000" →
 * wrong code; "@mailinator.com" → disposable domain rejected.
 */
export function mockAuthClient(initialEmail: string | null): AuthClient {
  let email = initialEmail;
  let pending = '';
  const wait = () => new Promise((r) => setTimeout(r, 350));
  const code = (c: string) => {
    if (c === '000000') throw fail('CodeMismatchException');
  };
  return {
    async getIdToken() {
      return email ? fakeJwt(email) : null;
    },
    async signIn(e, password) {
      await wait();
      if (password === 'incorrecta') throw fail('NotAuthorizedException');
      pending = e;
      if (e.startsWith('nuevo')) return 'confirmSignUp';
      if (e.startsWith('invitado')) return 'newPassword';
      email = e;
      return 'done';
    },
    async completeNewPassword() {
      await wait();
      email = pending;
      return 'done';
    },
    async signUp(e) {
      await wait();
      if (e.endsWith('@mailinator.com')) throw fail('UserLambdaValidationException');
      if (e === 'laura@consultoriolaura.co') throw fail('UsernameExistsException');
      pending = e;
      return 'confirm';
    },
    async confirmSignUp(_e, c) {
      await wait();
      code(c);
      return true;
    },
    async autoSignIn() {
      email = pending;
      return 'done';
    },
    async resendSignUpCode() {
      await wait();
    },
    async resetPassword() {
      await wait();
    },
    async confirmResetPassword(_e, c) {
      await wait();
      code(c);
    },
    async signOut() {
      email = null;
    },
  };
}

export function installMocks(): void {
  const as = param('as', ['pro', 'admin', 'guest'], 'pro');
  const state = param('state', STATES, 'trial') as MockState;
  const billing = param('billing', ['none', 'pending', 'rejected'], 'none') as BillingMockState;
  const team = param('team', ['none', 'pending', 'rejected', 'approved', 'seats'], 'none') as TeamMockState;
  const delay = Number(new URL(window.location.href).searchParams.get('delay') ?? 150);
  pinClock(MOCK_NOW);
  resetMockDb({ state, isAdmin: as === 'admin', billing, team });
  setTransport((req) => mockTransport(req, Number.isFinite(delay) ? delay : 150));
  push.set(mockPushAdapter());
  const installParam = param('install', ['android', 'ios', 'ios-other', 'installed', 'none', 'real'], 'real');
  if (installParam !== 'real') {
    const variant: InstallVariant = installParam === 'android' ? 'prompt' : (installParam as InstallVariant);
    installStore.override(variant, variant === 'prompt' ? fakeInstallPrompt() : undefined);
  }
  void auth.init(mockAuthClient(as === 'guest' ? null : 'laura@consultoriolaura.co'));
  console.info(`[sepárame] mock mode · as=${as} · state=${state} · team=${team} · contraseña «incorrecta» = error, código 000000 = incorrecto`);
}

/** Fake PushManager for mock mode: subscribes instantly, no browser prompt. */
export function mockPushAdapter(): PushAdapter {
  let endpoint: string | null = null;
  let permission: NotificationPermission = 'default';
  return {
    supported: () => true,
    permission: () => permission,
    currentEndpoint: async () => endpoint,
    async subscribe() {
      permission = 'granted';
      endpoint = 'https://push.example.com/mock/this-device';
      return { endpoint, keys: { p256dh: 'mock-p256dh', auth: 'mock-auth' }, deviceLabel: deviceLabel() };
    },
    async unsubscribe() {
      const removed = endpoint;
      endpoint = null;
      return removed;
    },
  };
}

/** Chromium's install prompt, faked: "accepts" and fires the installed event. */
export function fakeInstallPrompt(): BeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
  let resolve: (v: { outcome: 'accepted' | 'dismissed' }) => void = () => {};
  Object.assign(event, {
    userChoice: new Promise((r) => (resolve = r)),
    prompt: async () => {
      resolve({ outcome: 'accepted' });
      setTimeout(() => installStore.markInstalled(), 50);
    },
  });
  return event;
}
