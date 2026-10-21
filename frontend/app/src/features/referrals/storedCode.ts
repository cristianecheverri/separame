/**
 * The referral code from separame.app/r/<code> (CloudFront → /app/signup?ref=<code>), kept in
 * localStorage so it survives the email confirmation and a closed tab. Attribution layers:
 *  1. the signup page sends it to Cognito as clientMetadata → the pre sign-up trigger stores it per
 *     email (works even when the email is confirmed on another device);
 *  2. onboarding (POST /me/onboarding) sends it in the body; the server prefers it over (1).
 * The server ignores bad codes, self-referrals and accounts that already had a trial.
 */
import { isValidReferralCode, REFERRAL_QUERY_PARAM } from '@shared/referrals';
import { local } from '../../lib/storage';

const KEY = 'separame:referral';
/** Same window as the server's sign-up marker. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Saves `?ref=` when present and valid; returns the code to use (fresh one or the stored one). */
export function captureReferralCode(search: string, now = Date.now()): string | null {
  const raw = new URLSearchParams(search).get(REFERRAL_QUERY_PARAM)?.trim().toLowerCase() ?? '';
  if (raw && isValidReferralCode(raw)) {
    local.set(KEY, JSON.stringify({ code: raw, at: now }));
    return raw;
  }
  return storedReferralCode(now);
}

export function storedReferralCode(now = Date.now()): string | null {
  try {
    const value = JSON.parse(local.get(KEY) ?? 'null') as { code?: unknown; at?: unknown } | null;
    if (!value || typeof value.code !== 'string' || typeof value.at !== 'number') return null;
    if (now - value.at > MAX_AGE_MS || !isValidReferralCode(value.code)) {
      local.remove(KEY);
      return null;
    }
    return value.code;
  } catch {
    return null;
  }
}

export const clearReferralCode = () => local.remove(KEY);
