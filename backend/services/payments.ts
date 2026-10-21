import type {
  ManualPaymentRequest, ManualPaymentResponse, PaymentNoticeRequest,
} from '../../shared/api';
import { GSI1, SSM_PARAMS } from '../../shared/infra';
import { paymentInstructionsSchema } from '../../shared/schemas';
import { referralUrl, type ReferralRewardOutcome } from '../../shared/referrals';
import { extendPaidUntil } from '../../shared/subscription';
import { addDays, bogotaDate, toInstant, todayBogota, type ISOInstant } from '../../shared/time';
import type { Payment, PaymentInstructions, SubscriptionStatus } from '../../shared/types';
import type { AuthUser } from '../lib/auth';
import { failedConditionIndex, queryAll, stripKeys, table, transactWrite, type Item, type TransactItem } from '../lib/dynamo';
import { env } from '../lib/env';
import { ApiError, validationError } from '../lib/http';
import { newId } from '../lib/ids';
import { log } from '../lib/logger';
import { PAY_PREFIX, paymentGsi1Sk, paymentsGsi1Pk, paySk, proPk, subKey } from '../lib/keys';
import { getOptionalParam } from '../lib/ssm';
import { sendManualPaymentReceipt, sendNoticeReceived, sendNoticeRejected, sendNoticeToAdmin, sendReferralReward } from '../mail/notifications';
import { hitRateLimit, RATE_RULES } from '../lib/rate-limit';
import { findPackage, requirePrice } from './prices';
import { getProfile } from './profiles';
import { ensureReferralCode, listReferralRecords, planPendingMonths, planReferralCredit } from './referrals';
import { loadSubItem, subIndexAttrs, subscriptionStatus, type SubItem } from './subscriptions';

/**
 * Payments (`PRO#<id> / PAY#<createdAt>#<id>`). There is no payment gateway:
 * professionals pay by Nequi or bank transfer and report it with "Ya pagué"
 * (a `pending` notice, at most one at a time, flagged on the subscription as
 * `pendingNoticeId`). An admin approves it — the notice item becomes the
 * approved payment and `paidUntil` is extended in the SAME transaction — or
 * rejects it. Admins can also record payments directly (audited with
 * `recordedBy`). Optimistic concurrency on the subscription's `updatedAt`.
 */

const CONCURRENCY_RETRIES = 3;

export function toPayment(item: Item): Payment {
  const p = stripKeys<Payment>(item);
  return {
    id: p.id, proId: p.proId, method: p.method, status: p.status, source: p.source ?? 'admin',
    amountCop: p.amountCop ?? null, months: p.months ?? null, paidAt: p.paidAt, until: p.until ?? null,
    reference: p.reference ?? '', priceVersionId: p.priceVersionId,
    ...(p.recordedBy ? { recordedBy: p.recordedBy } : {}),
    ...(p.gateway ? { gateway: p.gateway } : {}),
    ...(p.reviewedBy ? { reviewedBy: p.reviewedBy } : {}),
    ...(p.reviewedAt ? { reviewedAt: p.reviewedAt } : {}),
    ...(p.rejectReason ? { rejectReason: p.rejectReason } : {}),
    ...(p.referral ? { referral: p.referral } : {}),
    createdAt: p.createdAt,
  };
}

async function paymentItems(proId: string, limit: number): Promise<Item[]> {
  return queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': proPk(proId), ':p': PAY_PREFIX },
    ScanIndexForward: false,
    ConsistentRead: true,
    Limit: limit,
  }, limit);
}

/** Newest first (pending notices included). */
export async function listPayments(proId: string, limit = 50): Promise<Payment[]> {
  return (await paymentItems(proId, limit)).map(toPayment);
}

async function requireNotice(proId: string, paymentId: string): Promise<Payment> {
  const item = (await paymentItems(proId, 500)).find((p) => p.id === paymentId);
  if (!item || item.source !== 'pro_notice') throw new ApiError('not_found', 'No encontramos ese aviso de pago.');
  const notice = toPayment(item);
  if (notice.status !== 'pending') throw new ApiError('conflict', 'Ese aviso ya fue revisado.');
  return notice;
}

/** Bogotá `YYYY-MM` of an instant. */
export const bogotaMonth = (instant: ISOInstant | Date): string => bogotaDate(instant).slice(0, 7);

/** Payment item; approved ones also land in the GSI1 monthly revenue bucket. */
export function paymentItem(payment: Payment): Item {
  return {
    PK: proPk(payment.proId),
    SK: paySk(payment.createdAt, payment.id),
    ...payment,
    ...(payment.status === 'approved'
      ? { [GSI1.pk]: paymentsGsi1Pk(bogotaMonth(payment.paidAt)), [GSI1.sk]: paymentGsi1Sk(payment.paidAt, payment.proId, payment.id) }
      : {}),
  };
}

/** How to pay (SSM plain String with JSON); null until the admin configures it or when invalid. */
export async function getPaymentInstructions(): Promise<PaymentInstructions | null> {
  const raw = await getOptionalParam(SSM_PARAMS.billingInstructions);
  if (!raw) return null;
  try {
    const parsed = paymentInstructionsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  log.warn('billing instructions parameter is not valid JSON for PaymentInstructions');
  return null;
}

// ── "Ya pagué" ─────────────────────────────────────────────────────────────

/** The professional reports a Nequi/transfer payment for one of their plan's packages. */
export async function createPaymentNotice(proId: string, input: PaymentNoticeRequest, now: Date = new Date()): Promise<Payment> {
  await hitRateLimit(RATE_RULES.paymentNoticePerPro, proId, now);
  const sub = await loadSubItem(proId, true);
  if (!sub) throw new ApiError('needs_onboarding');
  if (sub.pendingNoticeId) throw new ApiError('conflict', 'Ya nos avisaste de un pago. Lo estamos revisando y te escribimos apenas quede activo.');
  const price = await requirePrice(sub.priceVersionId);
  const pkg = findPackage(price, input.months);
  if (!pkg) throw validationError({ months: 'Ese paquete no está disponible en tu plan' });

  const at = now.toISOString();
  const notice: Payment = {
    id: newId(now), proId, method: input.method, status: 'pending', source: 'pro_notice', amountCop: pkg.amountCop,
    months: pkg.months, paidAt: at, until: null, reference: input.reference ?? '', priceVersionId: price.id, createdAt: at,
  };
  try {
    await transactWrite([
      { Put: { TableName: table(), Item: paymentItem(notice), ConditionExpression: 'attribute_not_exists(PK)' } },
      {
        Update: {
          TableName: table(),
          Key: subKey(proId),
          UpdateExpression: 'SET pendingNoticeId = :id',
          ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(pendingNoticeId)',
          ExpressionAttributeValues: { ':id': notice.id },
        },
      },
    ]);
  } catch (err) {
    if (failedConditionIndex(err) === 1) throw new ApiError('conflict', 'Ya nos avisaste de un pago. Lo estamos revisando.');
    throw err;
  }
  log.info('payment notice created', { proId, paymentId: notice.id, months: notice.months });

  try {
    const profile = await getProfile(proId);
    if (profile) {
      await Promise.all([
        sendNoticeToAdmin({ profile, payment: notice, price }),
        sendNoticeReceived({ profile, payment: notice }),
      ]);
    }
  } catch (err) {
    log.error('payment notice emails failed', { proId, err });
  }
  return notice;
}

export async function rejectPaymentNotice(admin: AuthUser, proId: string, paymentId: string, reason: string, now: Date = new Date()): Promise<Payment> {
  const notice = await requireNotice(proId, paymentId);
  const at = now.toISOString();
  const reviewedBy = { sub: admin.sub, email: admin.email };
  try {
    await transactWrite([
      {
        Update: {
          TableName: table(),
          Key: { PK: proPk(proId), SK: paySk(notice.createdAt, notice.id) },
          UpdateExpression: 'SET #st = :rejected, reviewedBy = :by, reviewedAt = :at, rejectReason = :r',
          ConditionExpression: '#st = :pending',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':rejected': 'rejected', ':pending': 'pending', ':by': reviewedBy, ':at': at, ':r': reason },
        },
      },
      { Update: { TableName: table(), Key: subKey(proId), UpdateExpression: 'REMOVE pendingNoticeId' } },
    ]);
  } catch (err) {
    if (failedConditionIndex(err) === 0) throw new ApiError('conflict', 'Ese aviso ya fue revisado.');
    throw err;
  }
  const rejected: Payment = { ...notice, status: 'rejected', reviewedBy, reviewedAt: at, rejectReason: reason };
  log.info('payment notice rejected', { proId, paymentId, by: admin.sub });
  try {
    const profile = await getProfile(proId);
    if (profile) await sendNoticeRejected({ profile, payment: rejected });
  } catch (err) {
    log.error('notice rejection email failed', { proId, err });
  }
  return rejected;
}

// ── Approved payments ──────────────────────────────────────────────────────

export interface ApplyPaymentInput {
  proId: string;
  /** New paidUntil from the current subscription. */
  paidUntil: (sub: SubItem) => ISOInstant;
  /** Builds the approved payment once the new paidUntil is known. */
  payment: (paidUntil: ISOInstant, sub: SubItem) => Payment;
  /** Approving a notice: its item is overwritten (only while still pending) and the flag cleared. */
  approvesNotice?: boolean;
  now: Date;
}

export interface ApplyPaymentResult {
  payment: Payment;
  subscription: SubscriptionStatus;
  /** "Mes gratis por referido" records of the payer's saved months, applied after this payment. */
  appliedReferralMonths: Payment[];
  /** The referrer's reward this payment triggered (first qualifying payment of a referred account). */
  referralCredit: { referrerProId: string; outcome: ReferralRewardOutcome; payment: Payment | null } | null;
}

/**
 * THE single path for every approved payment (admin manual payment, approved "Ya pagué" notice, and
 * future gateways). One transaction: the payer's subscription (+ any months they saved from referrals
 * while expired), the payment, and — when this is a referred account's first qualifying payment — the
 * referrer's free month (or saved month) behind the conditional `REFREWARD#` marker, so retries and
 * replays never reward twice. Emails go out only after the commit.
 */
export async function applyApprovedPayment(input: ApplyPaymentInput): Promise<ApplyPaymentResult> {
  let skipReferralCredit = false;
  for (let attempt = 0; ; attempt++) {
    const sub = await loadSubItem(input.proId, true);
    if (!sub) throw new ApiError('not_found', 'No encontramos esa suscripción.');
    const basePaidUntil = input.paidUntil(sub);
    const payment = input.payment(basePaidUntil, sub);
    const pending = await planPendingMonths(sub, basePaidUntil, input.now);
    const paidUntil = pending.paidUntil;
    const next: SubItem = { ...sub, paidUntil, updatedAt: input.now.toISOString() };
    const lastPayment = { method: payment.method, amountCop: payment.amountCop, paidAt: payment.paidAt, status: payment.status };
    const paymentOp: TransactItem = input.approvesNotice
      ? {
        Put: {
          TableName: table(),
          Item: paymentItem(payment),
          ConditionExpression: '#st = :pending',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':pending': 'pending' },
        },
      }
      : { Put: { TableName: table(), Item: paymentItem(payment), ConditionExpression: 'attribute_not_exists(PK)' } };
    const ops: TransactItem[] = [
      {
        Update: {
          TableName: table(),
          Key: subKey(input.proId),
          UpdateExpression: 'SET paidUntil = :pu, #g1sk = :g1sk, lastPayment = :lp, updatedAt = :u',
          ConditionExpression: 'updatedAt = :prev',
          ExpressionAttributeNames: { '#g1sk': GSI1.sk },
          ExpressionAttributeValues: {
            ':pu': paidUntil, ':g1sk': subIndexAttrs(next)[GSI1.sk], ':lp': lastPayment, ':u': next.updatedAt, ':prev': sub.updatedAt,
          },
        },
      },
      paymentOp,
      ...pending.payments.map((p): TransactItem => ({ Put: { TableName: table(), Item: paymentItem(p), ConditionExpression: 'attribute_not_exists(PK)' } })),
    ];
    const savedStart = ops.length;
    ops.push(...pending.ops);
    const savedEnd = ops.length;

    const credit = skipReferralCredit ? null : await planReferralCredit(sub, payment, input.now, ops.length);
    if (credit) {
      ops.push(...credit.ops);
      if (credit.payment) ops.push({ Put: { TableName: table(), Item: paymentItem(credit.payment), ConditionExpression: 'attribute_not_exists(PK)' } });
    }
    const subUpdate = ops[0].Update!;
    const removes = input.approvesNotice ? ' REMOVE pendingNoticeId' : '';
    if (credit) {
      subUpdate.UpdateExpression = `SET paidUntil = :pu, #g1sk = :g1sk, lastPayment = :lp, updatedAt = :u, referralRewardedAt = :rr${removes}`;
      subUpdate.ExpressionAttributeValues = { ...subUpdate.ExpressionAttributeValues, ':rr': input.now.toISOString() };
    } else {
      subUpdate.UpdateExpression = `${subUpdate.UpdateExpression}${removes}`;
    }

    try {
      await transactWrite(ops);
    } catch (err) {
      const index = failedConditionIndex(err);
      const retry = attempt < CONCURRENCY_RETRIES;
      // Someone else changed a subscription (payer or referrer) or a saved month in between: re-read and retry.
      if (retry && (index === 0 || (index >= savedStart && index < savedEnd) || (credit && index === credit.referrerSubIndex))) continue;
      if (index === 1 && input.approvesNotice) throw new ApiError('conflict', 'Ese aviso ya fue revisado.');
      // The reward marker exists: this referred account was already rewarded (replay) — commit without it.
      if (credit && index === credit.markerIndex && retry) {
        skipReferralCredit = true;
        continue;
      }
      throw err;
    }

    const referralCredit = credit ? { referrerProId: credit.referrer.proId, outcome: credit.outcome, payment: credit.payment } : null;
    if (credit) {
      log.info('referral credited', { referredProId: input.proId, referrerProId: credit.referrer.proId, outcome: credit.outcome.kind });
      await notifyReferralCredit(credit.referrer, sub, payment, credit.outcome);
    }
    if (pending.payments.length) log.info('saved referral months applied', { proId: input.proId, months: pending.payments.length });
    return { payment, subscription: subscriptionStatus(next, input.now), appliedReferralMonths: pending.payments, referralCredit };
  }
}

/** "¡Ganaste un mes gratis!" to the referrer (best effort: never undoes the committed payment). */
async function notifyReferralCredit(referrer: SubItem, referred: SubItem, payment: Payment, outcome: ReferralRewardOutcome): Promise<void> {
  try {
    const profile = await getProfile(referrer.proId);
    if (!profile) return;
    const code = referrer.referralCode ?? (await ensureReferralCode(referrer.proId));
    const savedMonths = outcome.kind === 'saved'
      ? (await listReferralRecords(referrer.proId, true)).filter((r) => r.state === 'saved').length
      : 0;
    await sendReferralReward({
      profile,
      referred: { name: referred.name, title: referred.title },
      paidMonths: payment.months ?? 1,
      paidAt: payment.paidAt,
      outcome,
      previousAccessUntil: subscriptionStatus(referrer).accessUntil,
      savedMonths,
      referralUrl: referralUrl(env.siteUrl(), code),
    });
  } catch (err) {
    log.error('referral reward email failed', { referrerProId: referrer.proId, err });
  }
}

/** End of a Bogotá calendar day as an instant (23:59:59.999 local). */
export const endOfBogotaDay = (date: string): ISOInstant =>
  new Date(new Date(toInstant(addDays(date, 1), '00:00')).getTime() - 1).toISOString();

/**
 * Admin records a payment (+N months, or an exact date) or approves a "Ya
 * pagué" notice (`noticeId`). Keeps the price version; audited.
 */
export async function recordManualPayment(
  admin: AuthUser, proId: string, input: ManualPaymentRequest, now: Date = new Date(),
): Promise<ManualPaymentResponse> {
  const today = todayBogota(now);
  if ('until' in input.period && input.period.until < today) {
    throw validationError({ 'period.until': 'La fecha debe ser hoy o después' });
  }
  if (input.paidAt > today) throw validationError({ paidAt: 'La fecha del pago no puede ser futura' });
  const profile = await getProfile(proId, true);
  if (!profile) throw new ApiError('not_found', 'No encontramos ese profesional.');
  const notice = input.noticeId ? await requireNotice(proId, input.noticeId) : null;
  const who = { sub: admin.sub, email: admin.email };

  const period = input.period;
  const result = await applyApprovedPayment({
    proId,
    now,
    approvesNotice: !!notice,
    paidUntil: (sub) => ('months' in period ? extendPaidUntil(sub, period.months, now) : endOfBogotaDay(period.until)),
    payment: (until, sub) => ({
      id: notice?.id ?? newId(now),
      proId,
      method: input.method,
      status: 'approved',
      source: notice ? 'pro_notice' : 'admin',
      amountCop: input.method === 'courtesy' ? null : input.amountCop,
      months: 'months' in period ? period.months : null,
      paidAt: toInstant(input.paidAt, '12:00'),
      until,
      reference: input.reference || notice?.reference || '',
      priceVersionId: sub.priceVersionId,
      ...(notice ? { reviewedBy: who, reviewedAt: now.toISOString() } : { recordedBy: who }),
      createdAt: notice?.createdAt ?? now.toISOString(),
    }),
  });
  log.info('manual payment recorded', { proId, paymentId: result.payment.id, by: admin.sub, method: input.method, notice: !!notice });

  if (input.notify) {
    try {
      const price = await requirePrice(result.subscription.priceVersionId);
      await sendManualPaymentReceipt({
        profile, payment: result.payment, price, referralMonths: result.appliedReferralMonths.length, accessUntil: result.subscription.accessUntil,
      });
    } catch (err) {
      log.error('manual payment receipt failed', { proId, err });
    }
  }
  return { payment: result.payment, subscription: result.subscription };
}

/** Approved payments in a Bogotá month, from the GSI1 bucket. */
export async function revenueForMonth(yearMonth: string): Promise<number> {
  const items = await queryAll({
    IndexName: GSI1.name,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': GSI1.pk, '#a': 'amountCop', '#s': 'status' },
    ExpressionAttributeValues: { ':pk': paymentsGsi1Pk(yearMonth) },
    ProjectionExpression: '#a, #s',
  }, 50_000);
  return items.reduce((sum, p) => sum + (p.status === 'approved' && typeof p.amountCop === 'number' ? p.amountCop : 0), 0);
}
