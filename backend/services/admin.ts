import type {
  AdminProDetailResponse, AdminStatsResponse, AdminSubscriptionRow, ListSubscriptionsQuery,
} from '../../shared/api';
import { ApiError } from '../lib/http';
import { countUpcoming } from './appointments';
import { bogotaMonth, listPayments, revenueForMonth } from './payments';
import { ensureDefaultPrices, requirePrice } from './prices';
import { getProfile } from './profiles';
import { adminReferralInfo } from './referrals';
import { listSubItems, loadSubItem, subscriptionStatus, type SubItem } from './subscriptions';

/** Admin read models over the GSI1 `SUBS` listing (in-memory filtering/sorting is fine at this scale). */

export async function adminStats(now: Date = new Date()): Promise<AdminStatsResponse> {
  const [subs, revenueMonthCop] = await Promise.all([listSubItems(), revenueForMonth(bogotaMonth(now))]);
  const counts = { trial: 0, active: 0, grace: 0, expired: 0 };
  for (const sub of subs) counts[subscriptionStatus(sub, now).state]++;
  const pendingNotices = subs.filter((s) => !!s.pendingNoticeId).length;
  return { ...counts, pendingNotices, revenueMonthCop };
}

const normalizeText = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matchesQuery(sub: Pick<SubItem, 'name' | 'slug' | 'email'>, q: string): boolean {
  const needle = normalizeText(q.trim());
  if (!needle) return true;
  return [sub.name, sub.slug, sub.email].some((field) => normalizeText(field ?? '').includes(needle));
}

export async function adminSubscriptions(query: ListSubscriptionsQuery, now: Date = new Date()): Promise<AdminSubscriptionRow[]> {
  const [subs, prices] = await Promise.all([listSubItems(), ensureDefaultPrices(now)]);
  const priceNames = new Map(prices.map((p) => [p.id, p.name]));
  return subs
    .map((sub) => ({ sub, status: subscriptionStatus(sub, now) }))
    .filter(({ sub, status }) => (!query.state || status.state === query.state) && (!query.q || matchesQuery(sub, query.q)))
    .map(({ sub, status }) => ({
      proId: sub.proId,
      name: sub.name,
      slug: sub.slug,
      title: sub.title,
      email: sub.email,
      state: status.state,
      accessUntil: status.accessUntil,
      graceUntil: status.graceUntil,
      price: { id: sub.priceVersionId, name: priceNames.get(sub.priceVersionId) ?? sub.priceVersionId },
      lastPayment: sub.lastPayment ?? null,
      pendingNotice: !!sub.pendingNoticeId,
    }))
    // "Ya pagué" notices waiting for review first; otherwise GSI1 order (graceUntil).
    .sort((a, b) => Number(b.pendingNotice) - Number(a.pendingNotice));
}

export async function adminProDetail(proId: string, now: Date = new Date()): Promise<AdminProDetailResponse> {
  const [profile, sub] = await Promise.all([getProfile(proId, true), loadSubItem(proId, true)]);
  if (!profile || !sub) throw new ApiError('not_found', 'No encontramos ese profesional.');
  const [price, payments, upcomingAppointments, referralInfo] = await Promise.all([
    requirePrice(sub.priceVersionId), listPayments(proId), countUpcoming(proId, now), adminReferralInfo(sub, now),
  ]);
  return {
    profile,
    subscription: subscriptionStatus(sub, now),
    price,
    payments,
    upcomingAppointments,
    trialStartedAt: sub.trialStartedAt ?? sub.createdAt,
    ...referralInfo,
  };
}
