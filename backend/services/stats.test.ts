import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, DEFAULT_SCHEDULE } from '../../shared/availability';
import { PRO_ID, setTestEnv } from '../testing/fixtures';
import type { AppointmentItem } from './appointments';
import { computeStats, proStats } from './stats';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const NOW = new Date('2026-10-23T20:00:00.000Z'); // Friday 3:00 p. m.

const appt = (id: string, start: string, extra: Partial<AppointmentItem> = {}): AppointmentItem => ({
  id, proId: PRO_ID, serviceId: 's1', serviceName: 'Valoración', durationMin: 60, priceCop: 50000, start, end: start, status: 'confirmed',
  client: { name: 'X', email: '', phone: '' }, createdBy: 'client', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '', lockBufferMin: 0,
  clientConfirmation: 'pending', revision: 0, clientKey: 'c1', ...extra,
});

// Week Mon 19 – Sun 25 Oct 2026 (no holidays). Default schedule: 8 h on weekdays, 4 h Saturday → 44 h.
const week = [
  appt('a1', '2026-10-19T14:00:00.000Z', { outcome: 'attended' }), // Mon
  appt('a2', '2026-10-20T14:00:00.000Z', { outcome: 'no_show', clientKey: 'c2', serviceId: 's2', serviceName: 'Limpieza', priceCop: 120000 }), // Tue
  appt('a3', '2026-10-21T14:00:00.000Z', { createdBy: 'pro', clientKey: 'c3', priceCop: null }), // Wed, past, unmarked
  appt('a4', '2026-10-22T14:00:00.000Z', { status: 'cancelled' }), // Thu
  appt('a5', '2026-10-24T14:00:00.000Z', { clientKey: 'deleted' }), // Sat, future
  appt('x0', '2026-10-12T14:00:00.000Z'), // previous week
];

describe('computeStats', () => {
  const stats = computeStats({
    from: '2026-10-19', to: '2026-10-25', appointments: week, schedule: DEFAULT_SCHEDULE, rules: DEFAULT_RULES, blocks: [],
    firstSeen: new Map([['c1', '2026-09-01T00:00:00.000Z'], ['c2', '2026-10-19T12:00:00.000Z']]), now: NOW,
  });

  it('counts appointments, outcomes and unmarked', () => {
    expect(stats).toMatchObject({ appointments: 4, cancelled: 1, attended: 1, noShows: 1, unmarked: 1 });
    expect(stats.noShowRate).toBeCloseTo(1 / 3);
  });

  it('occupancy = booked minutes / bookable minutes', () => {
    expect(stats.occupancy).toBeCloseTo(240 / (44 * 60));
  });

  it('new vs returning by firstSeenAt (unknown → new; deleted clients ignored)', () => {
    expect(stats.newClients).toBe(2); // c2 first seen this week, c3 has no record
    expect(stats.returningClients).toBe(1); // c1
  });

  it('name-only appointments count as appointments but not as clients', () => {
    const withNameOnly = computeStats({
      from: '2026-10-19', to: '2026-10-25', schedule: DEFAULT_SCHEDULE, rules: DEFAULT_RULES, blocks: [], now: NOW,
      appointments: [...week, appt('a6', '2026-10-23T14:00:00.000Z', { createdBy: 'pro', clientKey: '' })],
      firstSeen: new Map([['c1', '2026-09-01T00:00:00.000Z'], ['c2', '2026-10-19T12:00:00.000Z']]),
    });
    expect(withNameOnly.appointments).toBe(stats.appointments + 1);
    expect(withNameOnly.newClients).toBe(stats.newClients);
    expect(withNameOnly.returningClients).toBe(stats.returningClients);
  });

  it('revenue, services, weekdays (Mon = 0) and source', () => {
    expect(stats.estimatedRevenueCop).toBe(50000 + 120000 + 50000);
    expect(stats.byService).toEqual([
      { serviceId: 's1', serviceName: 'Valoración', appointments: 3, revenueCop: 100000 },
      { serviceId: 's2', serviceName: 'Limpieza', appointments: 1, revenueCop: 120000 },
    ]);
    expect(stats.byWeekday.map((d) => d.appointments)).toEqual([1, 1, 1, 0, 0, 1, 0]);
    expect(stats.bySource).toEqual({ client: 3, pro: 1 });
  });
});

describe('proStats', () => {
  beforeEach(() => {
    ddb.reset();
    ddb.on(GetCommand).resolves({});
    ddb.on(QueryCommand).resolves({ Items: [] });
    ddb.on(QueryCommand, { IndexName: 'lsi1-start' }).resolves({ Items: week });
  });

  it('returns the range and the same-length previous period from one LSI query', async () => {
    const res = await proStats(PRO_ID, '2026-10-19', '2026-10-25', NOW);
    expect(res.previous).toMatchObject({ from: '2026-10-12', to: '2026-10-18', appointments: 1 });
    expect(res.stats.appointments).toBe(4);
    const lsi = ddb.commandCalls(QueryCommand).filter((c) => c.args[0].input.IndexName);
    expect(lsi).toHaveLength(1);
    expect(lsi[0].args[0].input.ExpressionAttributeValues).toMatchObject({ ':from': 'APPT#2026-10-12T05:00:00.000Z', ':to': 'APPT#2026-10-26T05:00:00.000Z' });
  });

  it('caps the range at STATS_MAX_DAYS', async () => {
    await expect(proStats(PRO_ID, '2025-01-01', '2026-10-25', NOW)).rejects.toMatchObject({ code: 'validation' });
  });
});
