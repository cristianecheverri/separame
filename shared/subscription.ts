/**
 * Subscription rules (see CLAUDE.md "Reglas de suscripción"). Computed, never
 * stored: the source of truth is `trialEndsAt` + `paidUntil` on the
 * subscription item. Always evaluated on the server before any write.
 */
import { addMonths, maxInstant, type ISOInstant } from './time';
import type { SubscriptionStatus } from './types';

export const TRIAL_DAYS = 7;
export const GRACE_DAYS = 3;
/** Renewal reminder email this many days before accessUntil. */
export const RENEWAL_NOTICE_DAYS = 3;
/** Price migrations must be announced at least this many days before taking effect. */
export const MIGRATION_NOTICE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionInput {
  trialEndsAt: ISOInstant;
  paidUntil: ISOInstant | null;
  priceVersionId: string;
}

export function computeSubscription(sub: SubscriptionInput, now: Date = new Date(), graceDays = GRACE_DAYS): SubscriptionStatus {
  const accessUntil = maxInstant(sub.trialEndsAt, sub.paidUntil) as ISOInstant;
  const accessMs = new Date(accessUntil).getTime();
  const graceUntil = new Date(accessMs + graceDays * DAY_MS).toISOString();
  const t = now.getTime();
  const paidActive = !!sub.paidUntil && new Date(sub.paidUntil).getTime() > t;

  let state: SubscriptionStatus['state'];
  if (t < accessMs) state = paidActive ? 'active' : 'trial';
  else if (t < accessMs + graceDays * DAY_MS) state = 'grace';
  else state = 'expired';

  return {
    state,
    trialEndsAt: sub.trialEndsAt,
    paidUntil: sub.paidUntil,
    accessUntil,
    graceUntil,
    daysLeft: Math.max(0, Math.ceil((accessMs - t) / DAY_MS)),
    canAcceptBookings: state !== 'expired',
    readOnly: state === 'expired',
    priceVersionId: sub.priceVersionId,
  };
}

/**
 * New `paidUntil` after paying `months`: counted from the end of the current
 * trial/paid period, or from now if that already passed ("si el plan ya
 * venció, los meses se cuentan desde hoy"). Used when an admin records or approves a payment.
 */
export function extendPaidUntil(sub: Pick<SubscriptionInput, 'trialEndsAt' | 'paidUntil'>, months: number, now: Date = new Date()): ISOInstant {
  const base = maxInstant(now.toISOString(), sub.trialEndsAt, sub.paidUntil) as ISOInstant;
  return addMonths(base, months);
}
