import { computeSubscription } from '../../shared/subscription';
import type { ISOInstant, Payment, SubscriptionStatus } from '../../shared/types';
import { getItem, queryAll } from '../lib/dynamo';
import { ApiError } from '../lib/http';
import { profileKey, SUBS_GSI1PK, subGsi1Sk, subKey } from '../lib/keys';
import { GSI1 } from '../../shared/infra';

/**
 * The subscription item (`PRO#<id> / SUB`) and the server-side gate every
 * write goes through. The state is never stored: it is computed from
 * `trialEndsAt` + `paidUntil` with `computeSubscription`, always from a
 * consistent read before a write.
 *
 * The item also carries a denormalized copy of the profile's name/slug/title/
 * email and the last payment, so the admin list is a single GSI1 query.
 */

export interface SubItem {
  proId: string;
  trialEndsAt: ISOInstant;
  trialStartedAt: ISOInstant;
  paidUntil: ISOInstant | null;
  priceVersionId: string;
  /** Optional cohort for price migrations ("Tutorías"). */
  group?: string;
  /** accessUntil value the renewal notice was already sent for. */
  renewalNoticeFor?: ISOInstant;
  name: string;
  slug: string;
  title: string;
  email: string;
  lastPayment?: Pick<Payment, 'method' | 'amountCop' | 'paidAt' | 'status'>;
  /** Id of the "Ya pagué" notice awaiting review (at most one). */
  pendingNoticeId?: string;
  /** Own immutable referral code (link /r/<code>); set on onboarding, or lazily for older accounts. */
  referralCode?: string;
  /** Set when this account signed up with someone's referral link. */
  referredBy?: { proId: string; code: string };
  /** When this account's first qualifying payment earned its referrer the free month. */
  referralRewardedAt?: ISOInstant;
  createdAt: ISOInstant;
  updatedAt: ISOInstant;
}

export function subscriptionStatus(item: Pick<SubItem, 'trialEndsAt' | 'paidUntil' | 'priceVersionId'>, now: Date = new Date()): SubscriptionStatus {
  return computeSubscription(
    { trialEndsAt: item.trialEndsAt, paidUntil: item.paidUntil ?? null, priceVersionId: item.priceVersionId },
    now,
  );
}

/** GSI1 attributes for a subscription (re-set whenever `paidUntil` changes). */
export function subIndexAttrs(item: Pick<SubItem, 'proId' | 'trialEndsAt' | 'paidUntil' | 'priceVersionId'>) {
  const status = subscriptionStatus(item);
  return { [GSI1.pk]: SUBS_GSI1PK, [GSI1.sk]: subGsi1Sk(status.graceUntil, item.proId) };
}

export async function loadSubItem(proId: string, consistent = true): Promise<SubItem | undefined> {
  return getItem<SubItem>(subKey(proId), consistent);
}

/** Team plan: a team member's owner (members have no SUB of their own), or undefined. */
export async function ownerIdOf(proId: string): Promise<string | undefined> {
  const profile = await getItem<{ ownerId?: string }>(profileKey(proId), true);
  return profile?.ownerId;
}

/**
 * The subscription that governs a professional: their own, or their team owner's for a team
 * member (one expiry for the whole team). `item.proId` is the paying professional.
 */
export async function loadSubscription(proId: string, now: Date = new Date()): Promise<{ item: SubItem; status: SubscriptionStatus }> {
  let item = await loadSubItem(proId, true);
  if (!item) {
    const ownerId = await ownerIdOf(proId);
    if (ownerId) item = await loadSubItem(ownerId, true);
  }
  if (!item) throw new ApiError('needs_onboarding');
  return { item, status: subscriptionStatus(item, now) };
}

/** Pro writes: expired → the panel is read-only. */
export function assertWritable(status: SubscriptionStatus): void {
  if (status.readOnly) throw new ApiError('read_only');
}

/** New public bookings / reschedules: expired → "Agenda no disponible temporalmente". */
export function assertBookable(status: SubscriptionStatus): void {
  if (!status.canAcceptBookings) throw new ApiError('agenda_unavailable');
}

/** Loads the subscription consistently and fails with `read_only` when expired. */
export async function requireWritable(proId: string, now: Date = new Date()) {
  const sub = await loadSubscription(proId, now);
  assertWritable(sub.status);
  return sub;
}

/** Every subscription (GSI1 `SUBS`), ordered by graceUntil. Fine to scan in memory at this scale. */
export async function listSubItems(): Promise<SubItem[]> {
  return queryAll<SubItem>({
    IndexName: GSI1.name,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': GSI1.pk },
    ExpressionAttributeValues: { ':pk': SUBS_GSI1PK },
  }, 20_000);
}

/** Pros that can take bookings (graceUntil ≥ now) with their slug: the sitemap's profile pages. */
export async function listBookablePros(now: Date = new Date()): Promise<Pick<SubItem, 'proId' | 'slug'>[]> {
  const items = await queryAll<Pick<SubItem, 'proId' | 'slug'>>({
    IndexName: GSI1.name,
    KeyConditionExpression: '#pk = :pk AND #sk >= :from',
    ProjectionExpression: 'proId, #slug',
    ExpressionAttributeNames: { '#pk': GSI1.pk, '#sk': GSI1.sk, '#slug': 'slug' },
    ExpressionAttributeValues: { ':pk': SUBS_GSI1PK, ':from': now.toISOString() },
  }, 50_000);
  return items.filter((item) => item.slug);
}

/** Subscriptions whose graceUntil falls in [from, to] (GSI1 range — renewal notices). */
export async function listSubItemsByGrace(from: ISOInstant, to: ISOInstant): Promise<SubItem[]> {
  return queryAll<SubItem>({
    IndexName: GSI1.name,
    KeyConditionExpression: '#pk = :pk AND #sk BETWEEN :from AND :to',
    ExpressionAttributeNames: { '#pk': GSI1.pk, '#sk': GSI1.sk },
    ExpressionAttributeValues: { ':pk': SUBS_GSI1PK, ':from': from, ':to': `${to}#~` },
  }, 1000);
}
