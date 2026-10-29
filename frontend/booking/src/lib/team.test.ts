import { describe, expect, it, vi } from 'vitest';
import type { AvailabilityResponse, CreateBookingRequest, PublicProfile } from '@shared/api';
import type { DayAvailability } from '@shared/availability';
import { MOCK_TEAM } from '../mock/fixtures';
import { createMockApi } from '../mock/mockApi';
import { ANY_PRO, createTeamApi, mergeAvailability, mergeServices, profileForChoice, settleInBatches, teamPageOf, type Offering } from './team';

const [laura, julian, sara] = MOCK_TEAM.members;

const day = (date: string, slots: string[], closed: DayAvailability['closed'] = null): DayAvailability => ({
  date, weekday: 'thu', closed, slots,
});
const response = (days: DayAvailability[], active = true): AvailabilityResponse => ({ active, serviceId: 'x', from: '2026-10-22', days });
const offering = (member: PublicProfile, index: number): Offering => ({ member, service: member.services[0], index });

describe('mergeServices', () => {
  it('merges the same name and duration (ignoring case and accents) and keeps the first texts', () => {
    const merged = mergeServices(MOCK_TEAM.members);
    const valoracion = merged.filter((s) => s.name === 'Valoración');
    expect(valoracion).toHaveLength(1);
    expect(valoracion[0].offerings.map((o) => o.member.slug)).toEqual(['dra-laura-perez', 'dra-sara-gomez']);
    expect(valoracion[0].offerings.map((o) => o.service.id)).toEqual(['valoracion', 'sg-valoracion']);
    // Every other service appears once, owner's first.
    const total = MOCK_TEAM.members.reduce((n, m) => n + m.services.length, 0);
    expect(merged).toHaveLength(total - 1);
    expect(merged[0].name).toBe('Valoración');

    const other = mergeServices([
      { ...laura, services: [{ ...laura.services[0], name: 'valoracion ' }] },
      { ...sara, services: [{ ...sara.services[0], durationMin: 45 }] },
    ]);
    expect(other).toHaveLength(2);
  });

  it('shows «Desde <lowest>» when professionals charge differently for the same service', () => {
    const svc = (priceCop: number | null, priceDisplay?: 'fixed' | 'agreed') => ({ ...laura.services[0], name: 'Valoración', durationMin: 30, priceCop, priceDisplay });
    const [differ] = mergeServices([{ ...laura, services: [svc(60000)] }, { ...sara, services: [svc(80000)] }]);
    expect(differ).toMatchObject({ priceCop: 60000, priceDisplay: 'fixed', priceFrom: true });
    const [same] = mergeServices([{ ...laura, services: [svc(60000)] }, { ...sara, services: [svc(60000)] }]);
    expect(same.priceFrom).toBeUndefined();
    const [noFixed] = mergeServices([{ ...laura, services: [svc(null, 'agreed')] }, { ...sara, services: [svc(0)] }]);
    expect(noFixed).toMatchObject({ priceDisplay: 'hidden' });
  });

  it('builds the «Cualquiera disponible» profile with the team slug', () => {
    const page = teamPageOf(MOCK_TEAM);
    expect(profileForChoice(page, ANY_PRO)?.slug).toBe('consultorio-sonrie');
    expect(profileForChoice(page, 'dr-julian-ortiz')?.name).toBe('Dr. Julián Ortiz');
    expect(profileForChoice(page, 'nobody')).toBeNull();
    expect(profileForChoice(page, null)).toBeNull();
  });
});

describe('mergeAvailability', () => {
  const a = '2026-10-22T13:00:00.000Z';
  const b = '2026-10-22T13:30:00.000Z';
  const c = '2026-10-22T14:00:00.000Z';

  it('unions the hours and gives each to the least busy free member, ties by team order', () => {
    const { data, assignees } = mergeAvailability('any:30:valoracion', [
      { offering: offering(laura, 0), data: response([day('2026-10-22', [a])]) },
      { offering: offering(sara, 2), data: response([day('2026-10-22', [a, b, c])]) },
    ]);
    expect(data.days[0].slots).toEqual([a, b, c]);
    // Sara has more free hours that day: she gets every hour she can take.
    expect([a, b, c].map((s) => assignees.get(s)?.member.slug)).toEqual(['dra-sara-gomez', 'dra-sara-gomez', 'dra-sara-gomez']);

    const tie = mergeAvailability('x', [
      { offering: offering(julian, 1), data: response([day('2026-10-22', [b, c])]) },
      { offering: offering(laura, 0), data: response([day('2026-10-22', [a, b])]) },
    ]);
    expect([a, b, c].map((s) => tie.assignees.get(s)?.member.slug)).toEqual(['dra-laura-perez', 'dra-laura-perez', 'dr-julian-ortiz']);
  });

  it('closes a day only when everybody is closed, and is inactive when any member is', () => {
    const merged = mergeAvailability('x', [
      { offering: offering(laura, 0), data: response([day('2026-10-22', [], 'holiday'), day('2026-10-23', [], 'weekly')]) },
      { offering: offering(sara, 2), data: response([day('2026-10-22', [a]), day('2026-10-23', [], 'weekly')]) },
    ]);
    expect(merged.data.days.map((d) => d.closed)).toEqual([null, 'weekly']);
    expect(merged.data.days[0].slots).toEqual([a]);

    const inactive = mergeAvailability('x', [
      { offering: offering(laura, 0), data: response([day('2026-10-22', [a])]) },
      { offering: offering(sara, 2), data: response([], false) },
    ]);
    expect(inactive.data).toMatchObject({ active: false, days: [] });
  });
});

describe('createTeamApi', () => {
  it('fans «Cualquiera disponible» out to the members and books with the assigned one', async () => {
    const base = createMockApi(new URLSearchParams('delay=0'));
    const createBooking = vi.spyOn(base, 'createBooking');
    const page = teamPageOf(MOCK_TEAM);
    const api = createTeamApi(base, page);
    const serviceId = page.any.services[0].id;
    const availability = await api.getAvailability(MOCK_TEAM.slug, { serviceId, from: '2026-10-22', days: 1 });
    const nine = '2026-10-22T14:00:00.000Z'; // 9:00 a. m. Bogotá: Dra. Laura Pérez is busy, Dra. Sara Gómez is free.
    expect(availability.days[0].slots).toContain(nine);
    expect(api.assigneeOf(serviceId, nine)?.member.slug).toBe('dra-sara-gomez');

    const body: CreateBookingRequest = {
      serviceId, start: nine, consent: true, turnstileToken: 't', idempotencyKey: 'k',
      client: { name: 'Mariana Gómez', email: '', phone: '3001234567' },
    };
    const result = await api.createBooking(MOCK_TEAM.slug, body);
    expect(createBooking).toHaveBeenCalledWith('dra-sara-gomez', { ...body, serviceId: 'sg-valoracion' });
    expect(result.booking.pro.name).toBe('Dra. Sara Gómez');

    // An hour nobody was assigned (stale page) is treated as taken.
    await expect(api.createBooking(MOCK_TEAM.slug, { ...body, start: '2026-10-22T03:00:00.000Z' })).rejects.toMatchObject({ code: 'slot_taken' });
    // A member's own slug goes straight through.
    await api.createBooking('dr-julian-ortiz', { ...body, serviceId: 'jo-retenedor', idempotencyKey: 'k2', start: '2026-10-22T16:00:00.000Z' });
    expect(createBooking).toHaveBeenLastCalledWith('dr-julian-ortiz', expect.objectContaining({ serviceId: 'jo-retenedor' }));
  });
});

describe('«Cualquiera disponible» holds', () => {
  it('a new hour with another professional frees the hold kept with the previous one at once', async () => {
    const base = createMockApi(new URLSearchParams('delay=0'));
    const hold = vi.spyOn(base, 'holdSlot');
    const release = vi.spyOn(base, 'releaseHold');
    const page = teamPageOf(MOCK_TEAM);
    const api = createTeamApi(base, page);
    const serviceId = page.any.services[0].id;
    const days = (await api.getAvailability(MOCK_TEAM.slug, { serviceId, from: '2026-10-22', days: 1 })).days[0].slots;
    const holdId = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    const [first, other] = [days.find((s) => api.assigneeOf(serviceId, s)?.member.slug === 'dra-sara-gomez')!, days.find((s) => api.assigneeOf(serviceId, s)?.member.slug !== 'dra-sara-gomez')!];
    await api.holdSlot(MOCK_TEAM.slug, { serviceId, start: first, holdId });
    expect(release).not.toHaveBeenCalled();
    await api.holdSlot(MOCK_TEAM.slug, { serviceId, start: other, holdId });
    expect(hold).toHaveBeenLastCalledWith(api.assigneeOf(serviceId, other)!.member.slug, expect.objectContaining({ holdId }));
    expect(release).toHaveBeenCalledWith('dra-sara-gomez', holdId);
    // Leaving «Cualquiera disponible» (picking someone): released with whoever holds it now.
    await api.releaseHold(MOCK_TEAM.slug, holdId);
    expect(release).toHaveBeenLastCalledWith(api.assigneeOf(serviceId, other)!.member.slug, holdId);
  });
});

describe('«Cualquiera disponible» waitlist', () => {
  it('sends one request to the team route with every member offering the service', async () => {
    const base = createMockApi(new URLSearchParams());
    const joinTeamWaitlist = vi.spyOn(base, 'joinTeamWaitlist');
    const page = teamPageOf(MOCK_TEAM);
    const api = createTeamApi(base, page);
    const valoracion = mergeServices(MOCK_TEAM.members).find((s) => s.name === 'Valoración')!;
    await api.joinWaitlist(MOCK_TEAM.slug, {
      serviceId: valoracion.id, dates: ['2026-10-22'], client: { name: 'Cliente', email: 'c@correo.com', phone: '3000000000' }, consent: true, turnstileToken: 't',
    });
    expect(joinTeamWaitlist).toHaveBeenCalledWith('consultorio-sonrie', expect.objectContaining({
      offerings: [{ slug: 'dra-laura-perez', serviceId: 'valoracion' }, { slug: 'dra-sara-gomez', serviceId: 'sg-valoracion' }],
    }));
  });
});

describe('settleInBatches', () => {
  it('never runs more than the limit at once and keeps the order', async () => {
    let running = 0;
    let peak = 0;
    const results = await settleInBatches([1, 2, 3, 4, 5, 6, 7, 8, 9], async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      if (n === 5) throw new Error('down');
      return n * 10;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'x'))).toEqual([10, 20, 30, 40, 'x', 60, 70, 80, 90]);
  });
});
