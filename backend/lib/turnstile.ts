import { SSM_PARAMS, TURNSTILE_TEST_KEYS } from '../../shared/infra';
import { env } from './env';
import { log } from './logger';
import { getOptionalParam } from './ssm';

/**
 * Cloudflare Turnstile server-side check (the invisible captcha on the public
 * booking page). The dev stage uses Cloudflare's always-pass test keys: when
 * the configured secret is the test secret (or dev has none), no network call
 * is made. Network failures fail closed in prod.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function secret(): Promise<string | undefined> {
  const value = await getOptionalParam(SSM_PARAMS.turnstileSecret);
  if (value) return value;
  if (!env.isProd()) return TURNSTILE_TEST_KEYS.secretKey;
  return undefined;
}

export async function verifyTurnstile(token: string, remoteIp?: string): Promise<boolean> {
  const key = await secret();
  if (!key) {
    log.error('turnstile secret missing');
    return false;
  }
  if (key === TURNSTILE_TEST_KEYS.secretKey) return token.length > 0;

  const form = new URLSearchParams({ secret: key, response: token });
  if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp);
  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!data.success) log.warn('turnstile rejected', { codes: data['error-codes'] });
    return data.success === true;
  } catch (err) {
    log.error('turnstile siteverify failed', { err });
    return false;
  }
}
