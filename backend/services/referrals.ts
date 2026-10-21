import type { AdminProDetailResponse, PublicReferralResponse, ReferralSummary } from '../../shared/api';
import { initials } from '../../shared/format';
import {
  isValidReferralCode, qualifiesForReferralReward, REFERRAL_REWARD_MONTHS, referralCodeBase, referralCodeCandidates,
  referralRewardOutcome, referralState, referralUrl, type ReferralRewardOutcome, type StoredReferralState,
} from '../../shared/referrals';
import { addMonths, type ISOInstant } from '../../shared/time';
import type { Payment, Referral } from '../../shared/types';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { GSI1 } from '../../shared/infra';
import { ddb, failedConditionIndex, getItem, queryAll, table, transactWrite, ttlInDays, type Item, type TransactItem } from '../lib/dynamo';
import { env } from '../lib/env';
import { ApiError } from '../lib/http';
import { newId } from '../lib/ids';
import { log } from '../lib/logger';
import { proPk, refCodeKey, REFERRAL_PREFIX, referralKey, refRewardKey, refSignupKey, subKey } from '../lib/keys';
import { sha256Hex } from '../lib/tokens';
import { loadSubItem, subIndexAttrs, type SubItem } from './subscriptions';

/**
 * Referral program (rules in shared/referrals.ts):
 *  - `REFCODE#<code>` → referrer (immutable code, also copied to the SUB item as `referralCode`);
 *  - `PRO#<referrer> / REFERRAL#<referred>` — one record per account that signed up with the link,
 *    written in the onboarding transaction; its `state` moves registered → rewarded | saved → rewarded;
 *  - `REFREWARD#<referred>` — the conditional marker that makes the reward one-per-account and idempotent;
 *  - `REFSIGNUP#<sha256(email)>` — the code a sign-up came with (pre sign-up trigger, TTL), so attribution
 *    survives confirming the email on another device (the signup page also keeps it in localStorage).
 *
 * The reward itself is planned here and committed by `applyApprovedPayment` (payments.ts) in the SAME
 * transaction as the payment that triggers it, so every approval path (admin manual payment, approved
 * "Ya pagué" notice, future gateways) credits referrals exactly once.
 */

/** How long the sign-up's code waits for the account to be created (onboarding). */
const SIGNUP_CODE_TTL_DAYS = 30;
const CODE_RETRIES = 6;
/** Saved months applied per payment (2 transaction items each; DynamoDB caps a transaction at 100). The rest wait for the next one. */
const MAX_PENDING_PER_PAYMENT = 40;

export interface ReferralRecord {
  referredProId: string;
  name: string;
  title: string;
  registeredAt: ISOInstant;
  trialEndsAt: ISOInstant;
  state: StoredReferralState;
  paidMonths: number | null;
  paidAt: ISOInstant | null;
  rewardedAt?: ISOInstant;
  /** When a saved month was finally added to the referrer's plan. */
  appliedAt?: ISOInstant;
}

const randomSuffix = () => newId().slice(-5);

// ── Codes ──────────────────────────────────────────────────────────────────

/** The referrer behind a code, or undefined (bad shape / unknown). */
export async function referrerIdByCode(code: string): Promise<string | undefined> {
  if (!isValidReferralCode(code)) return undefined;
  const item = await getItem<{ proId: string }>(refCodeKey(code));
  return item?.proId;
}

/**
 * The professional's referral code, creating it the first time: derived from the slug and reserved
 * with a conditional `REFCODE#` put in the same transaction that copies it to the SUB item.
 */
export async function ensureReferralCode(proId: string, now: Date = new Date()): Promise<string> {
  const sub = await loadSubItem(proId, true);
  if (!sub) throw new ApiError('needs_onboarding');
  if (sub.referralCode) return sub.referralCode;
  const candidates = referralCodeCandidates(referralCodeBase(sub.slug), randomSuffix);
  for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
    const code = candidates[attempt] ?? `${referralCodeBase(sub.slug).slice(0, 20).replace(/-+$/g, '')}-${randomSuffix()}`;
    try {
      await transactWrite([
        { Put: { TableName: table(), Item: { ...refCodeKey(code), proId, createdAt: now.toISOString() }, ConditionExpression: 'attribute_not_exists(PK)' } },
        {
          Update: {
            TableName: table(),
            Key: subKey(proId),
            UpdateExpression: 'SET referralCode = :c',
            ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(referralCode)',
            ExpressionAttributeValues: { ':c': code },
          },
        },
      ]);
      log.info('referral code created', { proId, code });
      return code;
    } catch (err) {
      const index = failedConditionIndex(err);
      if (index === 0) continue; // taken by someone else: next candidate
      if (index === 1) {
        // Created concurrently (two tabs): use that one.
        const fresh = await loadSubItem(proId, true);
        if (fresh?.referralCode) return fresh.referralCode;
      }
      throw err;
    }
  }
  throw new ApiError('conflict', 'No pudimos crear tu enlace de invitación. Intenta de nuevo.');
}

/** GET /public/referrals/{code} — "Te invitó Dra. Laura Pérez". */
export async function publicReferral(rawCode: string): Promise<PublicReferralResponse> {
  const code = rawCode.trim().toLowerCase();
  const proId = await referrerIdByCode(code);
  const sub = proId ? await loadSubItem(proId, false) : undefined;
  if (!sub) throw new ApiError('not_found', 'Este enlace de invitación no existe.');
  return { code, name: sub.name, initials: initials(sub.name) };
}

// ── Attribution (sign-up → onboarding) ─────────────────────────────────────

const emailHash = (email: string) => sha256Hex(email.trim().toLowerCase());

/** Pre sign-up trigger: remembers the code a self sign-up came with (ignored when malformed). */
export async function rememberSignupCode(email: string, rawCode: string, now: Date = new Date()): Promise<boolean> {
  const code = rawCode.trim().toLowerCase();
  if (!email || !isValidReferralCode(code)) return false;
  await ddb.send(new PutCommand({
    TableName: table(),
    Item: { ...refSignupKey(emailHash(email)), code, at: now.toISOString(), ttl: ttlInDays(SIGNUP_CODE_TTL_DAYS, now) },
  }));
  return true;
}

export interface OnboardingReferral {
  referrerProId: string;
  code: string;
}

/**
 * Who referred a new account, or null. Never throws for bad input: a wrong code, the referrer's own
 * email (self-referral) or an email that already used its free trial (not a new account) is ignored.
 */
export async function resolveOnboardingReferral(input: { email: string; referralCode?: string; trialUsed: boolean }): Promise<OnboardingReferral | null> {
  if (input.trialUsed || !input.email) return null;
  let code = input.referralCode?.trim().toLowerCase() || '';
  if (!code) {
    const saved = await getItem<{ code: string }>(refSignupKey(emailHash(input.email)), true);
    code = saved?.code ?? '';
  }
  if (!code) return null;
  const referrerProId = await referrerIdByCode(code);
  if (!referrerProId) return null;
  const referrer = await loadSubItem(referrerProId, true);
  if (!referrer) return null;
  if (referrer.email.trim().toLowerCase() === input.email.trim().toLowerCase()) {
    log.warn('self-referral ignored', { referrerProId });
    return null;
  }
  return { referrerProId, code };
}

export function referralRecordItem(referrerProId: string, record: ReferralRecord): Item {
  return { ...referralKey(referrerProId, record.referredProId), ...record };
}

/** Onboarding transaction item: the referrer's record of the new account. */
export function onboardingReferralOp(referral: OnboardingReferral, sub: SubItem): TransactItem {
  const record: ReferralRecord = {
    referredProId: sub.proId, name: sub.name, title: sub.title, registeredAt: sub.createdAt, trialEndsAt: sub.trialEndsAt,
    state: 'registered', paidMonths: null, paidAt: null,
  };
  return { Put: { TableName: table(), Item: referralRecordItem(referral.referrerProId, record), ConditionExpression: 'attribute_not_exists(PK)' } };
}

// ── Read models ────────────────────────────────────────────────────────────

export async function listReferralRecords(proId: string, consistent = false): Promise<ReferralRecord[]> {
  const items = await queryAll<ReferralRecord & Item>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': proPk(proId), ':p': REFERRAL_PREFIX },
    ConsistentRead: consistent,
  }, 2000);
  return items.map(({ PK: _pk, SK: _sk, ...record }) => record as ReferralRecord);
}

export function toReferral(record: ReferralRecord, now: Date): Referral {
  return {
    referredProId: record.referredProId, name: record.name, title: record.title ?? '', registeredAt: record.registeredAt,
    trialEndsAt: record.trialEndsAt, state: referralState(record, now), paidMonths: record.paidMonths ?? null, paidAt: record.paidAt ?? null,
  };
}

function summarize(records: ReferralRecord[], now: Date): Omit<ReferralSummary, 'code' | 'url'> {
  const monthsApplied = records.filter((r) => r.state === 'rewarded').length * REFERRAL_REWARD_MONTHS;
  const monthsPending = records.filter((r) => r.state === 'saved').length * REFERRAL_REWARD_MONTHS;
  return {
    monthsEarned: monthsApplied + monthsPending,
    monthsApplied,
    monthsPending,
    referrals: records.map((r) => toReferral(r, now)).sort((a, b) => b.registeredAt.localeCompare(a.registeredAt)),
  };
}

/** GET /me/referrals. */
export async function myReferrals(proId: string, now: Date = new Date()): Promise<ReferralSummary> {
  const [code, records] = await Promise.all([ensureReferralCode(proId, now), listReferralRecords(proId)]);
  return { code, url: referralUrl(env.siteUrl(), code), ...summarize(records, now) };
}

/** Admin pro detail: who invited them and their own referrals. */
export async function adminReferralInfo(sub: SubItem, now: Date = new Date()): Promise<Pick<AdminProDetailResponse, 'referredBy' | 'referrals'>> {
  const [records, referrer] = await Promise.all([
    listReferralRecords(sub.proId),
    sub.referredBy ? loadSubItem(sub.referredBy.proId, false) : Promise.resolve(undefined),
  ]);
  return {
    referredBy: sub.referredBy ? { proId: sub.referredBy.proId, code: sub.referredBy.code, name: referrer?.name ?? sub.referredBy.code } : null,
    referrals: {
      code: sub.referralCode ?? null,
      url: sub.referralCode ? referralUrl(env.siteUrl(), sub.referralCode) : null,
      ...summarize(records, now),
    },
  };
}

// ── Crediting (committed by applyApprovedPayment) ──────────────────────────

/** A "Mes gratis por referido" payment record (audited like any payment). */
export function referralPayment(input: {
  proId: string; priceVersionId: string; referred: { proId: string; name: string }; previousUntil: ISOInstant; until: ISOInstant; at: Date;
}): Payment {
  const at = input.at.toISOString();
  return {
    id: newId(input.at), proId: input.proId, method: 'courtesy', status: 'approved', source: 'referral', amountCop: 0,
    months: REFERRAL_REWARD_MONTHS, paidAt: at, until: input.until, reference: '', priceVersionId: input.priceVersionId,
    referral: { referredProId: input.referred.proId, referredName: input.referred.name, previousUntil: input.previousUntil },
    createdAt: at,
  };
}

/**
 * The payer's own saved months: added after `paidUntil` when one of their payments is approved,
 * each audited with its own payment record. Returns the final paidUntil, the records to write and
 * the REFERRAL items to flip (conditionally) from `saved` to `rewarded`.
 */
export async function planPendingMonths(sub: SubItem, paidUntil: ISOInstant, now: Date): Promise<{
  paidUntil: ISOInstant; payments: Payment[]; ops: TransactItem[];
}> {
  const saved = (await listReferralRecords(sub.proId, true))
    .filter((r) => r.state === 'saved')
    .sort((a, b) => (a.rewardedAt ?? '').localeCompare(b.rewardedAt ?? ''))
    .slice(0, MAX_PENDING_PER_PAYMENT);
  let until = paidUntil;
  const payments: Payment[] = [];
  const ops: TransactItem[] = [];
  saved.forEach((record, i) => {
    const next = addMonths(until, REFERRAL_REWARD_MONTHS);
    payments.push(referralPayment({
      proId: sub.proId, priceVersionId: sub.priceVersionId, referred: { proId: record.referredProId, name: record.name },
      previousUntil: until, until: next, at: new Date(now.getTime() + i + 1),
    }));
    until = next;
    ops.push({
      Update: {
        TableName: table(),
        Key: referralKey(sub.proId, record.referredProId),
        UpdateExpression: 'SET #st = :rewarded, appliedAt = :at',
        ConditionExpression: '#st = :saved',
        ExpressionAttributeNames: { '#st': 'state' },
        ExpressionAttributeValues: { ':rewarded': 'rewarded', ':saved': 'saved', ':at': now.toISOString() },
      },
    });
  });
  return { paidUntil: until, payments, ops };
}

export interface ReferralCreditPlan {
  referrer: SubItem;
  outcome: ReferralRewardOutcome;
  /** Only when applied: the referrer's audited free month. */
  payment: Payment | null;
  /** Reward marker first (its failure = already rewarded), then the referral record, then the referrer's plan. */
  ops: TransactItem[];
  markerIndex: number;
  referrerSubIndex: number;
}

/**
 * Plans the referrer's reward for an approved payment of `payer`, or null when nothing is due
 * (no referrer, already rewarded, the payment doesn't qualify, or self-referral). `indexOffset` is
 * where these ops start in the caller's transaction.
 */
export async function planReferralCredit(payer: SubItem, payment: Payment, now: Date, indexOffset: number): Promise<ReferralCreditPlan | null> {
  if (!payer.referredBy || payer.referralRewardedAt || !qualifiesForReferralReward(payment)) return null;
  if (payer.referredBy.proId === payer.proId) return null;
  const referrer = await loadSubItem(payer.referredBy.proId, true);
  if (!referrer) return null;
  const at = now.toISOString();
  const outcome = referralRewardOutcome(referrer, now);
  const record: ReferralRecord = {
    referredProId: payer.proId, name: payer.name, title: payer.title, registeredAt: payer.createdAt, trialEndsAt: payer.trialEndsAt,
    state: outcome.kind === 'applied' ? 'rewarded' : 'saved', paidMonths: payment.months, paidAt: payment.paidAt, rewardedAt: at,
  };
  const ops: TransactItem[] = [
    {
      Put: {
        TableName: table(),
        Item: { ...refRewardKey(payer.proId), referrerProId: referrer.proId, paymentId: payment.id, outcome: outcome.kind, at },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    { Put: { TableName: table(), Item: referralRecordItem(referrer.proId, record) } },
  ];
  let reward: Payment | null = null;
  if (outcome.kind === 'applied') {
    reward = referralPayment({
      proId: referrer.proId, priceVersionId: referrer.priceVersionId, referred: { proId: payer.proId, name: payer.name },
      previousUntil: outcome.previousUntil, until: outcome.paidUntil, at: now,
    });
    const next = { ...referrer, paidUntil: outcome.paidUntil };
    ops.push({
      Update: {
        TableName: table(),
        Key: subKey(referrer.proId),
        UpdateExpression: 'SET paidUntil = :pu, #g1sk = :g1sk, updatedAt = :u',
        ConditionExpression: 'updatedAt = :prev',
        ExpressionAttributeNames: { '#g1sk': GSI1.sk },
        ExpressionAttributeValues: { ':pu': outcome.paidUntil, ':g1sk': subIndexAttrs(next)[GSI1.sk], ':u': at, ':prev': referrer.updatedAt },
      },
    });
  }
  return {
    referrer, outcome, payment: reward, ops,
    markerIndex: indexOffset,
    referrerSubIndex: outcome.kind === 'applied' ? indexOffset + 2 : -1,
  };
}
