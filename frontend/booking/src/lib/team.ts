/**
 * Team plan on the public booking page (/<teamSlug>): the first step «¿Con quién?»
 * picks a member (their own profile, services and slug from then on) or
 * «Cualquiera disponible». The latter books through a synthetic profile whose
 * slug is the team's: its services are the members' services merged by name and
 * duration, and `createTeamApi` turns calls to that slug into calls to the
 * members (availability = union of their free hours, each hour assigned to one
 * free member; the hold and the booking go to that member). No new public endpoints.
 */
import type { AvailabilityResponse, PublicProfile, PublicService, PublicTeam } from '@shared/api';
import type { DayAvailability } from '@shared/availability';
import { formatServicePrice, priceDisplayOf } from '@shared/format';
import { ApiError, type ApiClient } from './api';

/** `draft.who` for «Cualquiera disponible» (never a slug: slugs are lowercase letters, digits and dashes). */
export const ANY_PRO = '*';

export interface Offering {
  member: PublicProfile;
  /** The member's own service (its id is what their endpoints know). */
  service: PublicService;
  /** Position in the team (owner = 0): ties and avatar color. */
  index: number;
}

export interface MergedService extends PublicService {
  /** Members offering it, in team order. */
  offerings: Offering[];
}

export interface TeamPage {
  team: PublicTeam;
  /** The consultorio as a profile: band, header row and «Agenda no disponible». */
  header: PublicProfile;
  /** «Cualquiera disponible»: the team's slug with the merged services. */
  any: PublicProfile;
  merged: Map<string, MergedService>;
}

/** Case-, accent- and spacing-insensitive name, so «Valoración» and «valoracion » are one service. */
function nameKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Same name + same duration = one entry; the first member offering it (team order) gives its texts and price. */
export function mergeServices(members: PublicProfile[]): MergedService[] {
  const byKey = new Map<string, MergedService>();
  members.forEach((member, index) => {
    for (const service of member.services) {
      const id = `any:${service.durationMin}:${nameKey(service.name)}`;
      const entry = byKey.get(id) ?? { ...service, id, offerings: [] };
      entry.offerings.push({ member, service, index });
      byKey.set(id, entry);
    }
  });
  return [...byKey.values()].map(withMergedPrice);
}

/**
 * The price a merged service shows: the shared one when every professional shows the same; else
 * «Desde <lowest>» if any has a fixed price, or no price at all (the review shows the real one).
 */
function withMergedPrice(merged: MergedService): MergedService {
  const prices = new Set(merged.offerings.map((o) => formatServicePrice(o.service)));
  if (prices.size <= 1) return merged;
  const fixed = merged.offerings.map((o) => o.service).filter((s) => priceDisplayOf(s) === 'fixed').map((s) => s.priceCop ?? 0);
  return fixed.length
    ? { ...merged, priceCop: Math.min(...fixed), priceDisplay: 'fixed', priceFrom: true }
    : { ...merged, priceDisplay: 'hidden', priceFrom: false };
}

export function teamPageOf(team: PublicTeam): TeamPage {
  const header: PublicProfile = {
    slug: team.slug,
    name: team.name,
    title: '',
    city: team.city,
    neighborhood: team.neighborhood,
    address: team.address,
    phone: team.phone,
    initials: team.initials,
    ...(team.logo ? { logo: team.logo } : {}),
    services: [],
  };
  const merged = mergeServices(team.members);
  return { team, header, any: { ...header, services: merged }, merged: new Map(merged.map((s) => [s.id, s])) };
}

/** The profile the flow books with: a member, «Cualquiera disponible», or none yet. */
export function profileForChoice(page: TeamPage, who: string | null | undefined): PublicProfile | null {
  if (!who) return null;
  if (who === ANY_PRO) return page.any;
  return page.team.members.find((m) => m.slug === who) ?? null;
}

interface Part {
  offering: Offering;
  data: AvailabilityResponse;
}

/**
 * Union of the members' free hours. Each hour goes to one member: the least
 * busy that day (most free hours), ties by team order — deterministic, so the
 * same page always shows the same «Te atiende». A day is closed only when it is
 * closed for everybody.
 */
export function mergeAvailability(serviceId: string, parts: Part[]): { data: AvailabilityResponse; assignees: Map<string, Offering> } {
  const assignees = new Map<string, Offering>();
  const from = parts[0]?.data.from ?? '';
  if (parts.length === 0 || !parts.every((p) => p.data.active)) {
    return { data: { active: false, serviceId, from, days: [] }, assignees };
  }
  const byDate = parts.map((p) => new Map(p.data.days.map((d) => [d.date, d])));
  const dates = [...new Set(parts.flatMap((p) => p.data.days.map((d) => d.date)))].sort();
  const days = dates.map((date): DayAvailability => {
    const own = parts
      .map((part, i) => ({ part, day: byDate[i].get(date) }))
      .filter((o): o is { part: Part; day: DayAvailability } => Boolean(o.day));
    const open = own
      .filter((o) => o.day.closed === null)
      .sort((a, b) => b.day.slots.length - a.day.slots.length || a.part.offering.index - b.part.offering.index);
    for (const { part, day } of open) {
      for (const slot of day.slots) if (!assignees.has(slot)) assignees.set(slot, part.offering);
    }
    const slots = [...new Set(open.flatMap((o) => o.day.slots))].sort();
    const base = own[0].day;
    const holidayName = own.find((o) => o.day.holidayName)?.day.holidayName;
    return {
      date,
      weekday: base.weekday,
      closed: open.length > 0 ? null : base.closed,
      ...(holidayName ? { holidayName } : {}),
      slots,
    };
  });
  return { data: { active: true, serviceId, from, days }, assignees };
}

export interface TeamApi extends ApiClient {
  /** Who books an hour of a «Cualquiera disponible» service (known once its availability arrived). */
  assigneeOf(serviceId: string, start: string): Offering | null;
}

/**
 * At most FANOUT_LIMIT availability calls at a time: a big team must not burst the shared API
 * throttle (or the Lambda concurrency) for every visitor of its page.
 */
export const FANOUT_LIMIT = 4;

export async function settleInBatches<T, R>(items: readonly T[], run: (item: T) => Promise<R>, limit = FANOUT_LIMIT): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.allSettled(items.slice(i, i + limit).map(run))));
  }
  return results;
}

/**
 * The page's API client: calls with a member's slug go straight through; calls
 * with the team's slug («Cualquiera disponible») fan out to the members.
 */
export function createTeamApi(base: ApiClient, page: TeamPage): TeamApi {
  const assigneesByService = new Map<string, Map<string, Offering>>();
  /** «Cualquiera disponible»: the member each hold id is currently held with. */
  const heldWith = new Map<string, string>();
  const isAny = (slug: string) => slug === page.team.slug;
  /** The member an hour of «Cualquiera disponible» goes to; an unknown hour (stale page) is handled like a taken one. */
  const assignee = (serviceId: string, start: string): Offering => {
    const offering = assigneesByService.get(serviceId)?.get(start);
    if (!offering) throw new ApiError('slot_taken', 'Slot not assigned', 409);
    return offering;
  };
  const mergedService = (serviceId: string): MergedService => {
    const merged = page.merged.get(serviceId);
    if (!merged || merged.offerings.length === 0) throw new ApiError('not_found', 'Unknown service', 404);
    return merged;
  };

  return {
    ...base,
    async getAvailability(slug, query) {
      if (!isAny(slug)) return base.getAvailability(slug, query);
      const merged = mergedService(query.serviceId);
      const settled = await settleInBatches(merged.offerings, (o) => base.getAvailability(o.member.slug, { ...query, serviceId: o.service.id }));
      const parts: Part[] = [];
      let failure: unknown = null;
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') parts.push({ offering: merged.offerings[i], data: result.value });
        else failure ??= result.reason;
      });
      // One member failing (network) still shows the others' hours.
      if (parts.length === 0) throw failure;
      const { data, assignees } = mergeAvailability(merged.id, parts);
      assigneesByService.set(merged.id, assignees);
      return data;
    },
    async releaseHold(slug, holdId) {
      if (!isAny(slug)) return base.releaseHold(slug, holdId);
      // «Cualquiera disponible» held it with one of the members.
      const member = heldWith.get(holdId);
      heldWith.delete(holdId);
      if (member) await base.releaseHold(member, holdId);
    },
    async createBooking(slug, body) {
      if (!isAny(slug)) return base.createBooking(slug, body);
      const offering = assignee(body.serviceId, body.start);
      return base.createBooking(offering.member.slug, { ...body, serviceId: offering.service.id });
    },
    async holdSlot(slug, body) {
      if (!isAny(slug)) return base.holdSlot(slug, body);
      const offering = assignee(body.serviceId, body.start);
      const result = await base.holdSlot(offering.member.slug, { ...body, serviceId: offering.service.id });
      // The new hour went to another professional: the one held before with them is freed at once.
      const previous = heldWith.get(body.holdId);
      heldWith.set(body.holdId, offering.member.slug);
      if (previous && previous !== offering.member.slug) void base.releaseHold(previous, body.holdId).catch(() => undefined);
      return result;
    },
    async joinWaitlist(slug, body) {
      if (!isAny(slug)) return base.joinWaitlist(slug, body);
      // One captcha token = one request: the server joins every member offering the service.
      const { serviceId, ...rest } = body;
      const offerings = mergedService(serviceId).offerings.map((o) => ({ slug: o.member.slug, serviceId: o.service.id }));
      return base.joinTeamWaitlist(page.team.slug, { ...rest, offerings });
    },
    assigneeOf(serviceId, start) {
      return assigneesByService.get(serviceId)?.get(start) ?? null;
    },
  };
}
