/**
 * Referral program rules (see CLAUDE.md "Referidos"). Pure logic shared by the
 * backend (which enforces it) and the panel (which explains it):
 *  - every professional has an immutable code → link `separame.app/r/<code>`;
 *  - when an account that signed up with it makes its FIRST qualifying payment
 *    (approved, ≥ 1 month, real money: not courtesy, not another referral month),
 *    the referrer earns ONE free month at the end of their access period;
 *  - an expired referrer keeps it as a pending month, applied on their next
 *    approved payment (a free month never reactivates an expired agenda by itself).
 */
import { computeSubscription, type SubscriptionInput } from './subscription';
import { addMonths, type ISOInstant } from './time';
import type { Payment, ReferralState } from './types';

/** Months earned per referred account that pays. */
export const REFERRAL_REWARD_MONTHS = 1;
/** Site path prefix of referral links: /r/<code>. */
export const REFERRAL_PATH = '/r/';
/** Query parameter the signup page reads (CloudFront redirects /r/<code> → /app/signup?ref=<code>). */
export const REFERRAL_QUERY_PARAM = 'ref';

export const REFERRAL_CODE_MIN = 3;
export const REFERRAL_CODE_MAX = 30;
const CODE_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Shape check (lowercase letters, digits and inner hyphens, 3–30 chars). */
export function isValidReferralCode(code: string): boolean {
  return code.length >= REFERRAL_CODE_MIN && code.length <= REFERRAL_CODE_MAX && CODE_RE.test(code) && !code.includes('--');
}

/** Honorific slug prefixes dropped from codes: "dra-laura-perez" → "laura-perez". */
const HONORIFICS = new Set(['dr', 'dra', 'doctor', 'doctora', 'lic', 'psic', 'ing', 'abg', 'prof', 'od', 'ft']);

/**
 * Preferred code for a professional, derived once from the slug at creation
 * (later slug changes never touch it, so shared links keep working).
 */
export function referralCodeBase(slug: string): string {
  const words = slug.toLowerCase().split('-').filter(Boolean);
  while (words.length > 1 && HONORIFICS.has(words[0])) words.shift();
  let code = words.join('-').slice(0, REFERRAL_CODE_MAX).replace(/-+$/g, '');
  if (code.length < REFERRAL_CODE_MIN) code = slug.toLowerCase().slice(0, REFERRAL_CODE_MAX).replace(/-+$/g, '');
  return code;
}

/** Alternatives when the base is taken: "laura-perez-2" … then a random suffix. */
export function referralCodeCandidates(base: string, random: () => string): string[] {
  const trimmed = base.slice(0, REFERRAL_CODE_MAX - 3).replace(/-+$/g, '');
  const numbered = [2, 3, 4, 5].map((n) => `${trimmed}-${n}`);
  const shortBase = base.slice(0, REFERRAL_CODE_MAX - 7).replace(/-+$/g, '');
  return [base, ...numbered, `${shortBase}-${random()}`].filter(isValidReferralCode);
}

/** https://separame.app/r/<code> */
export const referralUrl = (siteUrl: string, code: string): string => `${siteUrl.replace(/\/$/, '')}${REFERRAL_PATH}${code}`;

/** "separame.app/r/<code>" — how the link is shown. */
export const referralLinkLabel = (url: string): string => url.replace(/^https?:\/\//, '');

/** Does this approved payment earn the referrer their free month? (Only the first one ever is rewarded.) */
export function qualifiesForReferralReward(payment: Pick<Payment, 'status' | 'source' | 'method' | 'months' | 'amountCop'>): boolean {
  return (
    payment.status === 'approved'
    && payment.source !== 'referral'
    && payment.method !== 'courtesy'
    && (payment.months ?? 0) >= 1
    && (payment.amountCop ?? 0) > 0
  );
}

export type ReferralRewardOutcome =
  | { kind: 'applied'; previousUntil: ISOInstant; paidUntil: ISOInstant }
  | { kind: 'saved' };

/**
 * What happens to the referrer's subscription when a referred account qualifies:
 * expired (past the grace days, agenda closed) → the month is saved; otherwise it is added at the
 * end of the current access period, max(trialEndsAt, paidUntil).
 */
export function referralRewardOutcome(sub: SubscriptionInput, now: Date = new Date()): ReferralRewardOutcome {
  const status = computeSubscription(sub, now);
  if (status.state === 'expired') return { kind: 'saved' };
  return { kind: 'applied', previousUntil: status.accessUntil, paidUntil: addMonths(status.accessUntil, REFERRAL_REWARD_MONTHS) };
}

/** Stored state of a referral record (the trial/no-payment split is computed). */
export type StoredReferralState = 'registered' | 'rewarded' | 'saved';

export function referralState(record: { state: StoredReferralState; trialEndsAt: ISOInstant }, now: Date = new Date()): ReferralState {
  if (record.state !== 'registered') return record.state;
  return now.getTime() < new Date(record.trialEndsAt).getTime() ? 'trial' : 'no_payment';
}
