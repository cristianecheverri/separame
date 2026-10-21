/**
 * Mock mode bootstrap (VITE_MOCK=1, dev server only): in-memory API, fake
 * Cognito, clock pinned to the mockups' day. Query switches (remembered for
 * the tab): ?as=admin | ?as=pro | ?as=guest, ?state=trial|active|grace|expired|onboarding,
 * ?billing=none|pending|rejected,
 * ?delay=<ms>.
 */
import { setTransport } from '../lib/api';
import { auth } from '../lib/auth';
import { pinClock } from '../lib/clock';
import type { AuthClient } from '../lib/authClient';
import { session } from '../lib/storage';
import { MOCK_NOW, type BillingMockState, type MockState } from './fixtures';
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
  const delay = Number(new URL(window.location.href).searchParams.get('delay') ?? 150);
  pinClock(MOCK_NOW);
  resetMockDb({ state, isAdmin: as === 'admin', billing });
  setTransport((req) => mockTransport(req, Number.isFinite(delay) ? delay : 150));
  void auth.init(mockAuthClient(as === 'guest' ? null : 'laura@consultoriolaura.co'));
  console.info(`[sepárame] mock mode · as=${as} · state=${state} · contraseña «incorrecta» = error, código 000000 = incorrecto`);
}
