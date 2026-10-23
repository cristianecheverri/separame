import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apptKey, ownerKey, serviceKey, settingsKey, subKey } from '../../lib/keys';
import { apiEvent, parse, PRO_ID, proClaims, service, settings, setTestEnv, SUB_ID, subItem } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const START = '2026-10-21T15:00:00.000Z';
// An old item (before this feature): no clientConfirmation / revision / clientKey.
const legacy = {
  ...apptKey(PRO_ID, 'appt1'), id: 'appt1', proId: PRO_ID, serviceId: 's', serviceName: 'Valoración', durationMin: 30, priceCop: null,
  start: START, end: '2026-10-21T15:30:00.000Z', status: 'confirmed', client: { name: 'Mariana', email: 'm@correo.com', phone: '3001234567' },
  createdBy: 'client', createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', lockBufferMin: 10, LSI1SK: `APPT#${START}`,
};
const outcome = (value: string | null) => handler(apiEvent('POST /me/appointments/{appointmentId}/outcome', { claims: proClaims, path: { appointmentId: 'appt1' }, body: { outcome: value } }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  ddb.reset();
  ddb.on(GetCommand, { Key: ownerKey(SUB_ID) }).resolves({ Item: { proId: PRO_ID } });
  // Expired plan: outcome is record keeping and still allowed.
  ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: '2026-01-01T00:00:00.000Z' }) });
  ddb.on(GetCommand, { Key: apptKey(PRO_ID, 'appt1') }).resolves({ Item: legacy });
  ddb.on(UpdateCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [legacy] });
});
afterEach(() => vi.useRealTimers());

describe('outcome', () => {
  it('refuses before the start (too_late)', async () => {
    vi.setSystemTime(new Date('2026-10-21T14:59:00.000Z'));
    const res = await outcome('attended');
    expect(res.statusCode).toBe(422);
    expect(parse(res).error.code).toBe('too_late');
  });

  it('sets and clears the outcome after the start, even when read-only, without a revision bump', async () => {
    vi.setSystemTime(new Date('2026-10-21T16:00:00.000Z'));
    const set = parse(await outcome('no_show')).appointment;
    expect(set).toMatchObject({ outcome: 'no_show', outcomeAt: '2026-10-21T16:00:00.000Z', revision: 0, clientConfirmation: 'pending' });
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression).toBe('SET outcome = :o, outcomeAt = :at, updatedAt = :at');
    const cleared = parse(await outcome(null)).appointment;
    expect(cleared.outcome).toBeUndefined();
    expect(ddb.commandCalls(UpdateCommand)[1].args[0].input.UpdateExpression).toBe('SET updatedAt = :at REMOVE outcome, outcomeAt');
  });
});

describe('GET /me/appointments', () => {
  it('fills defaults for old items (clientConfirmation, revision, clientKey)', async () => {
    vi.setSystemTime(new Date('2026-10-20T16:00:00.000Z'));
    const res = await handler(apiEvent('GET /me/appointments', { claims: proClaims, query: { from: '2026-10-21', to: '2026-10-21' } }));
    const [a] = parse(res).appointments;
    expect(a).toMatchObject({ clientConfirmation: 'pending', revision: 0 });
    expect(a.clientKey).toMatch(/^[0-9a-f]{24}$/);
    expect(a.LSI1SK).toBeUndefined();
    expect(a.lockBufferMin).toBeUndefined();
  });

  it('accepts the 90-day ranges the Citas page asks for and rejects longer ones', async () => {
    const past = await handler(apiEvent('GET /me/appointments', { claims: proClaims, query: { from: '2026-07-22', to: '2026-10-20' } }));
    expect(past.statusCode).toBe(200);
    const tooLong = await handler(apiEvent('GET /me/appointments', { claims: proClaims, query: { from: '2026-07-01', to: '2026-10-20' } }));
    expect(tooLong.statusCode).toBe(400);
    expect(parse(tooLong).error.fields.to).toBe('El rango puede ser de máximo 92 días');
  });
});

describe('name-only appointments (pro-created, no email and no phone)', () => {
  const create = (client: Record<string, unknown>) =>
    handler(apiEvent('POST /me/appointments', { claims: proClaims, body: { serviceId: service.id, start: START, client } }));

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-10-19T13:00:00.000Z'));
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    ddb.on(GetCommand, { Key: serviceKey(PRO_ID, service.id) }).resolves({ Item: { ...serviceKey(PRO_ID, service.id), ...service } });
    ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: settings });
    ddb.on(QueryCommand).resolves({ Items: [] });
    ddb.on(TransactWriteCommand).resolves({});
  });

  it('accepts a name only and stores empty contact fields with no client key', async () => {
    const res = await create({ name: 'Don Jorge' });
    expect(res.statusCode).toBe(201);
    expect(parse(res).appointment).toMatchObject({ client: { name: 'Don Jorge', email: '', phone: '' }, clientKey: '', createdBy: 'pro' });
    const item = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Put!.Item!;
    expect(item).toMatchObject({ client: { name: 'Don Jorge', email: '', phone: '' }, clientKey: '' });
    expect((await create({ name: 'Don Jorge', email: '', phone: '' })).statusCode).toBe(201);
  });

  it('still validates what is given (and the name stays required)', async () => {
    expect(parse(await create({ name: 'Don Jorge', phone: '300' })).error.fields).toHaveProperty(['client.phone']);
    expect(parse(await create({ name: 'Don Jorge', email: 'jorge@' })).error.fields).toHaveProperty(['client.email']);
    expect(parse(await create({ name: '' })).error.fields).toHaveProperty(['client.name']);
  });

  it('can be moved, cancelled and marked attended like any other appointment', async () => {
    await create({ name: 'Don Jorge' });
    const stored = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Put!.Item!;
    ddb.on(GetCommand, { Key: apptKey(PRO_ID, stored.id) }).resolves({ Item: stored });

    const moved = await handler(apiEvent('PATCH /me/appointments/{appointmentId}', {
      claims: proClaims, path: { appointmentId: stored.id }, body: { start: '2026-10-21T16:00:00.000Z' },
    }));
    expect(moved.statusCode).toBe(200);
    expect(parse(moved).appointment).toMatchObject({ start: '2026-10-21T16:00:00.000Z', clientKey: '', revision: 1 });

    const cancelled = await handler(apiEvent('POST /me/appointments/{appointmentId}/cancel', {
      claims: proClaims, path: { appointmentId: stored.id }, body: {},
    }));
    expect(cancelled.statusCode).toBe(200);
    expect(parse(cancelled).appointment).toMatchObject({ status: 'cancelled', client: { name: 'Don Jorge', email: '', phone: '' } });

    vi.setSystemTime(new Date('2026-10-21T16:00:00.000Z'));
    const marked = await handler(apiEvent('POST /me/appointments/{appointmentId}/outcome', {
      claims: proClaims, path: { appointmentId: stored.id }, body: { outcome: 'attended' },
    }));
    expect(marked.statusCode).toBe(200);
    expect(parse(marked).appointment).toMatchObject({ outcome: 'attended', clientKey: '' });
  });
});

describe('GET /me/slots', () => {
  const slots = async (query: Record<string, string>) => {
    vi.setSystemTime(new Date('2026-10-20T13:00:00.000Z'));
    ddb.on(GetCommand).resolves({});
    ddb.on(GetCommand, { Key: ownerKey(SUB_ID) }).resolves({ Item: { proId: PRO_ID } });
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: '2027-01-01T00:00:00.000Z' }) });
    ddb.on(GetCommand, { Key: serviceKey(PRO_ID, service.id) }).resolves({ Item: service });
    ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: settings });
    ddb.on(QueryCommand).resolves({ Items: [] });
    ddb.on(QueryCommand, { IndexName: 'lsi1-start' }).resolves({ Items: [legacy] });
    const res = await handler(apiEvent('GET /me/slots', { claims: proClaims, query: { serviceId: service.id, from: '2026-10-21', days: '1', ...query } }));
    return (parse(res).days[0]?.slots ?? []) as string[];
  };

  it('moving an appointment: its own time does not block the slots around it', async () => {
    expect(await slots({})).not.toContain(START);
    expect(await slots({ excludeAppointmentId: 'appt1' })).toContain(START);
  });
});
