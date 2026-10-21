import { STATS_MAX_DAYS, type StatsResponse } from '../../shared/api';
import { bookableMinutes, type Interval } from '../../shared/availability';
import { addDays, bogotaDate, diffDays, jsWeekday, toInstant, type ISODate } from '../../shared/time';
import type { BookingRules, ProStats, WeeklySchedule } from '../../shared/types';
import { queryAll } from '../lib/dynamo';
import { validationError } from '../lib/http';
import { CLIENT_PREFIX, proPk } from '../lib/keys';
import { appointmentItemsBetween, type AppointmentItem } from './appointments';
import { getSettings, listBlocks } from './availability';
import { hasClientRecord } from './clients';

/**
 * Professional statistics for a Bogotá date range, plus the same-length
 * period right before it. Everything comes from one LSI1 range query, the
 * blocks, the current schedule (occupancy capacity via `bookableMinutes`)
 * and the client records (`firstSeenAt` → new vs. returning).
 */

export interface StatsInput {
  from: ISODate;
  to: ISODate;
  appointments: AppointmentItem[];
  schedule: WeeklySchedule;
  rules: BookingRules;
  blocks: Interval[];
  /** clientKey → firstSeenAt. */
  firstSeen: Map<string, string>;
  now: Date;
}

const ratio = (a: number, b: number) => (b > 0 ? Math.min(1, Math.max(0, a / b)) : 0);

export function computeStats(input: StatsInput): ProStats {
  const { from, to, now } = input;
  const inRange = input.appointments.filter((a) => {
    const d = bogotaDate(a.start);
    return d >= from && d <= to;
  });
  const active = inRange.filter((a) => a.status === 'confirmed');
  const t = now.toISOString();

  let attended = 0;
  let noShows = 0;
  let unmarked = 0;
  let bookedMinutes = 0;
  let revenue = 0;
  const byService = new Map<string, { serviceId: string; serviceName: string; appointments: number; revenueCop: number }>();
  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, appointments: 0 }));
  const bySource = { client: 0, pro: 0 };
  const clients = new Set<string>();

  for (const a of active) {
    if (a.outcome === 'attended') attended++;
    else if (a.outcome === 'no_show') noShows++;
    else if (a.start < t) unmarked++;
    bookedMinutes += a.durationMin;
    revenue += a.priceCop ?? 0;
    const s = byService.get(a.serviceId) ?? { serviceId: a.serviceId, serviceName: a.serviceName, appointments: 0, revenueCop: 0 };
    s.appointments++;
    s.revenueCop += a.priceCop ?? 0;
    byService.set(a.serviceId, s);
    byWeekday[(jsWeekday(bogotaDate(a.start)) + 6) % 7].appointments++;
    if (a.createdBy === 'client') bySource.client++;
    else bySource.pro++;
    // Name-only appointments have no client identity: they count as appointments, not as clients.
    if (hasClientRecord(a)) clients.add(a.clientKey);
  }

  let bookable = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    bookable += bookableMinutes(d, { schedule: input.schedule, rules: input.rules, blocks: input.blocks });
  }

  let newClients = 0;
  for (const key of clients) {
    const seen = input.firstSeen.get(key);
    if (!seen || bogotaDate(seen) >= from) newClients++;
  }

  return {
    from,
    to,
    appointments: active.length,
    cancelled: inRange.length - active.length,
    attended,
    noShows,
    unmarked,
    occupancy: ratio(bookedMinutes, bookable),
    newClients,
    returningClients: clients.size - newClients,
    estimatedRevenueCop: revenue,
    byService: [...byService.values()].sort((a, b) => b.appointments - a.appointments || b.revenueCop - a.revenueCop),
    byWeekday,
    bySource,
    noShowRate: ratio(noShows, attended + noShows + unmarked),
  };
}

export async function proStats(proId: string, from: ISODate, to: ISODate, now: Date = new Date()): Promise<StatsResponse> {
  const days = diffDays(from, to) + 1;
  if (days > STATS_MAX_DAYS) throw validationError({ to: `El rango puede ser de máximo ${STATS_MAX_DAYS} días` });
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  const [appointments, settings, blocks, clientItems] = await Promise.all([
    appointmentItemsBetween(proId, toInstant(prevFrom, '00:00'), toInstant(addDays(to, 1), '00:00')),
    getSettings(proId),
    listBlocks(proId),
    queryAll<{ key: string; firstSeenAt: string }>({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
      ExpressionAttributeNames: { '#k': 'key', '#f': 'firstSeenAt' },
      ExpressionAttributeValues: { ':pk': proPk(proId), ':p': CLIENT_PREFIX },
      ProjectionExpression: '#k, #f',
    }, 50_000),
  ]);
  const base = {
    appointments, schedule: settings.schedule, rules: settings.rules,
    blocks: blocks.map(({ start, end }) => ({ start, end })),
    firstSeen: new Map(clientItems.map((c) => [c.key, c.firstSeenAt])),
    now,
  };
  return { stats: computeStats({ ...base, from, to }), previous: computeStats({ ...base, from: prevFrom, to: prevTo }) };
}
