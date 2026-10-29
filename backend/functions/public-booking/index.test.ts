import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { clientKeyOf } from '../../../shared/clients';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apptKey, bookingIdempotencyKey, holdKey, serviceKey, settingsKey, slugKey, subKey, profileKey } from '../../lib/keys';
import { LOCK_FREE } from '../../services/appointments';
import { verifyManageToken } from '../../lib/tokens';
import {
  apiEvent, canceledTx, parse, PRO_ID, profile, service, settings, setTestEnv, subItem,
} from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ssm = mockClient(SSMClient);

// Monday 2026-10-19, 8:00 a. m. in Bogotá.
const NOW = new Date('2026-10-19T13:00:00.000Z');

function mockPro(sub = subItem()) {
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: slugKey(profile.slug) }).resolves({ Item: { proId: PRO_ID } });
  ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: sub });
  ddb.on(GetCommand, { Key: serviceKey(PRO_ID, service.id) }).resolves({ Item: { ...serviceKey(PRO_ID, service.id), ...service } });
  ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: settings });
  ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: { ...profileKey(PRO_ID), ...profile } });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(UpdateCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
}

const booking = (start: string, extra: Record<string, unknown> = {}) => apiEvent('POST /public/pros/{slug}/bookings', {
  path: { slug: profile.slug },
  body: {
    serviceId: service.id,
    start,
    client: { name: 'Mariana Gómez', email: 'Mariana@Correo.com', phone: '300 123 4567' },
    consent: true,
    turnstileToken: 'XXXX.DUMMY.TOKEN',
    ...extra,
  },
});

const IDEMPOTENCY_KEY = '3f1c2b9e-6a4d-4f7e-9b1a-2c3d4e5f6a7b';
const START = '2026-10-21T15:00:00.000Z';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  ddb.reset();
  ssm.reset();
  ssm.on(GetParameterCommand, { Name: '/separame/dev/links/signing-secret' }).resolves({ Parameter: { Value: 'link-secret' } });
  ssm.on(GetParameterCommand, { Name: '/separame/dev/turnstile/secret-key' })
    .rejects(Object.assign(new Error('not found'), { name: 'ParameterNotFound' }));
});

afterEach(() => vi.useRealTimers());

describe('POST /public/pros/{slug}/bookings', () => {
  it('writes the appointment and one lock per 5-minute unit in a single transaction', async () => {
    mockPro();
    // Wednesday 21 Oct, 10:00 a. m. Bogotá.
    const res = await handler(booking('2026-10-21T15:00:00.000Z'));
    expect(res.statusCode).toBe(201);

    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    // 30 min service + 10 min buffer = 8 units of 5 minutes, plus the appointment.
    expect(tx).toHaveLength(9);
    const appt = tx[0].Put!.Item!;
    expect(appt).toMatchObject({
      PK: `PRO#${PRO_ID}`,
      status: 'confirmed',
      start: '2026-10-21T15:00:00.000Z',
      end: '2026-10-21T15:30:00.000Z',
      LSI1SK: 'APPT#2026-10-21T15:00:00.000Z',
      GSI2PK: 'REMIND#2026-10-20',
      createdBy: 'client',
      revision: 0,
      clientConfirmation: 'pending',
      clientKey: clientKeyOf({ email: '', phone: '3001234567' }),
      client: { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' },
    });
    expect(appt.GSI2SK).toBe(`2026-10-20T15:00:00.000Z#${PRO_ID}#${appt.id}`);
    expect(tx[0].Put!.ConditionExpression).toBe('attribute_not_exists(PK)');
    const locks = tx.slice(1).map((t) => t.Put!);
    expect(locks.map((l) => l.Item!.SK)).toEqual(['10:00', '10:05', '10:10', '10:15', '10:20', '10:25', '10:30', '10:35']);
    expect(locks.every((l) => l.Item!.PK === `LOCK#${PRO_ID}#2026-10-21` && l.ConditionExpression === LOCK_FREE)).toBe(true);
    // Free = nobody has it, or only an expired hold does (this booking holds nothing).
    expect(locks[0].ExpressionAttributeValues).toEqual({ ':now': NOW.getTime(), ':hold': '-' });
    // TTL = slot end (15:30) + buffer (10 min) + 7 days.
    expect(locks.every((l) => l.Item!.ttl === Date.parse('2026-10-28T15:40:00.000Z') / 1000)).toBe(true);

    const body = parse(res);
    expect(body.booking).toMatchObject({ appointmentId: appt.id, serviceName: 'Valoración', clientConfirmation: 'pending', pro: { slug: profile.slug, initials: 'LP', neighborhood: 'El Poblado' } });
    const token = verifyManageToken(body.manageToken, 'link-secret', NOW);
    expect(token).toMatchObject({ ok: true, payload: { p: PRO_ID, a: appt.id } });
  });

  it('omits the reminder index when the appointment is less than 24 h away', async () => {
    mockPro();
    // Today 4:00 p. m. Bogotá (8 h from now).
    const res = await handler(booking('2026-10-19T21:00:00.000Z'));
    expect(res.statusCode).toBe(201);
    const appt = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Put!.Item!;
    expect(appt.GSI2PK).toBeUndefined();
    expect(appt.GSI2SK).toBeUndefined();
  });

  it('maps a lock condition failure to 409 slot_taken', async () => {
    mockPro();
    ddb.on(TransactWriteCommand).rejects(canceledTx(['None', 'None', 'ConditionalCheckFailed']));
    const res = await handler(booking('2026-10-21T15:00:00.000Z'));
    expect(res.statusCode).toBe(409);
    expect(parse(res).error).toEqual({ code: 'slot_taken', message: 'Alguien acaba de separar esa hora. Elige otra.' });
  });

  it('rejects a slot that is not offered (busy) before writing', async () => {
    mockPro();
    ddb.on(QueryCommand).resolves({ Items: [{ id: 'x', status: 'confirmed', start: '2026-10-21T15:00:00.000Z', end: '2026-10-21T15:30:00.000Z' }] });
    const res = await handler(booking('2026-10-21T15:00:00.000Z'));
    expect(parse(res).error.code).toBe('slot_taken');
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('refuses new bookings when the subscription expired (agenda_unavailable)', async () => {
    mockPro(subItem({ trialEndsAt: '2026-10-01T00:00:00.000Z' }));
    const res = await handler(booking('2026-10-21T15:00:00.000Z'));
    expect(res.statusCode).toBe(409);
    expect(parse(res).error.code).toBe('agenda_unavailable');
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('applies the per-IP rate limit', async () => {
    mockPro();
    ddb.on(UpdateCommand).rejects(Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' }));
    const res = await handler(booking('2026-10-21T15:00:00.000Z'));
    expect(res.statusCode).toBe(429);
    expect(parse(res).error.code).toBe('rate_limited');
  });

  it('books with the phone only: no reminder index (no email to send it to), rate limits keyed by phone', async () => {
    mockPro();
    const res = await handler(apiEvent('POST /public/pros/{slug}/bookings', {
      path: { slug: profile.slug },
      body: {
        serviceId: service.id, start: START, client: { name: 'Mariana Gómez', phone: '300 123 4567' }, consent: true, turnstileToken: 'XXXX.DUMMY.TOKEN',
      },
    }));
    expect(res.statusCode).toBe(201);
    const appt = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Put!.Item!;
    expect(appt.client).toEqual({ name: 'Mariana Gómez', email: '', phone: '3001234567' });
    expect(appt.GSI2PK).toBeUndefined();
    expect(appt.clientKey).toBe(clientKeyOf({ email: '', phone: '3001234567' }));
    const scopes = ddb.commandCalls(UpdateCommand).map((c) => String(c.args[0].input.Key!.PK).split('#')[1]);
    expect(scopes).toEqual(['book-ip', 'book-phone']);
    expect(parse(res).booking.client).toEqual({ name: 'Mariana Gómez', email: '' });
  });

  describe('idempotency', () => {
    const storedAppt = (overrides: Record<string, unknown> = {}) => ({
      ...apptKey(PRO_ID, 'appt-1'), id: 'appt-1', proId: PRO_ID, serviceId: service.id, serviceName: service.name, durationMin: 30,
      priceCop: service.priceCop, start: START, end: '2026-10-21T15:30:00.000Z', status: 'confirmed',
      client: { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' }, createdBy: 'client',
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), lockBufferMin: 10, ...overrides,
    });

    it('writes a 24 h marker in the same transaction as the appointment', async () => {
      mockPro();
      const res = await handler(booking(START, { idempotencyKey: IDEMPOTENCY_KEY }));
      expect(res.statusCode).toBe(201);
      const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
      expect(tx).toHaveLength(10);
      const marker = tx[1].Put!;
      expect(marker.Item).toEqual({
        ...bookingIdempotencyKey(PRO_ID, IDEMPOTENCY_KEY), apptId: tx[0].Put!.Item!.id, start: START, serviceId: service.id,
        ttl: NOW.getTime() / 1000 + 86_400,
      });
      expect(marker.ConditionExpression).toBe('attribute_not_exists(PK)');
    });

    it('returns the appointment a lost-response attempt already created instead of slot_taken', async () => {
      mockPro();
      ddb.on(GetCommand, { Key: bookingIdempotencyKey(PRO_ID, IDEMPOTENCY_KEY) })
        .resolves({ Item: { apptId: 'appt-1', start: START, serviceId: service.id } });
      ddb.on(GetCommand, { Key: apptKey(PRO_ID, 'appt-1') }).resolves({ Item: storedAppt() });
      // The slot is busy now — with our own appointment.
      ddb.on(QueryCommand).resolves({ Items: [storedAppt()] });
      const res = await handler(booking(START, { idempotencyKey: IDEMPOTENCY_KEY }));
      expect(res.statusCode).toBe(201);
      expect(parse(res).booking).toMatchObject({ appointmentId: 'appt-1', start: START });
      expect(verifyManageToken(parse(res).manageToken, 'link-secret', NOW)).toMatchObject({ ok: true, payload: { a: 'appt-1' } });
      expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
    });

    it('recovers when two copies of the same attempt race', async () => {
      mockPro();
      const markerKey = bookingIdempotencyKey(PRO_ID, IDEMPOTENCY_KEY);
      ddb.on(GetCommand, { Key: markerKey })
        .resolvesOnce({})
        .resolves({ Item: { apptId: 'appt-1', start: START, serviceId: service.id } });
      ddb.on(GetCommand, { Key: apptKey(PRO_ID, 'appt-1') }).resolves({ Item: storedAppt() });
      ddb.on(TransactWriteCommand).rejects(canceledTx(['None', 'ConditionalCheckFailed']));
      const res = await handler(booking(START, { idempotencyKey: IDEMPOTENCY_KEY }));
      expect(res.statusCode).toBe(201);
      expect(parse(res).booking.appointmentId).toBe('appt-1');
    });

    it('refuses a key reused for another slot', async () => {
      mockPro();
      ddb.on(GetCommand, { Key: bookingIdempotencyKey(PRO_ID, IDEMPOTENCY_KEY) })
        .resolves({ Item: { apptId: 'appt-1', start: '2026-10-21T16:00:00.000Z', serviceId: service.id } });
      ddb.on(GetCommand, { Key: apptKey(PRO_ID, 'appt-1') }).resolves({ Item: storedAppt({ start: '2026-10-21T16:00:00.000Z' }) });
      const res = await handler(booking(START, { idempotencyKey: IDEMPOTENCY_KEY }));
      expect(res.statusCode).toBe(409);
      expect(parse(res).error.code).toBe('conflict');
    });

    it('validates the key format', async () => {
      mockPro();
      const res = await handler(booking(START, { idempotencyKey: 'not-a-uuid' }));
      expect(res.statusCode).toBe(400);
      expect(parse(res).error.fields).toHaveProperty('idempotencyKey');
    });
  });
});

const HOLD_ID = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
/** Only the holds query (the appointments query must not see hold items). */
const HOLDS_QUERY = { ExpressionAttributeValues: { ':pk': `PRO#${PRO_ID}`, ':p': 'HOLD#', ':now': NOW.getTime() } };

const liveHold = (holdId: string, overrides: Record<string, unknown> = {}) => ({
  ...holdKey(PRO_ID, holdId), holdId, start: START, end: '2026-10-21T15:30:00.000Z', expiresAt: NOW.getTime() + 5 * 60_000, ...overrides,
});

describe('POST /public/pros/{slug}/bookings with a hold', () => {
  it('takes over its own hold: the locks accept it and the hold item is deleted in the same transaction', async () => {
    mockPro();
    const res = await handler(booking(START, { holdId: HOLD_ID }));
    expect(res.statusCode).toBe(201);
    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(tx[1].Delete).toEqual({ TableName: expect.any(String), Key: holdKey(PRO_ID, HOLD_ID) });
    const locks = tx.slice(2).map((t) => t.Put!);
    expect(locks).toHaveLength(8);
    expect(locks[0].ExpressionAttributeValues).toEqual({ ':now': NOW.getTime(), ':hold': HOLD_ID });
  });

  it("someone else's live hold makes the hour taken before writing", async () => {
    mockPro();
    ddb.on(QueryCommand, HOLDS_QUERY).resolves({ Items: [liveHold('other-hold')] });
    const res = await handler(booking(START, { holdId: HOLD_ID }));
    expect(parse(res).error.code).toBe('slot_taken');
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});

const hold = (start: string, holdId = HOLD_ID) => apiEvent('POST /public/pros/{slug}/holds', {
  path: { slug: profile.slug },
  body: { serviceId: service.id, start, holdId },
});

describe('POST /public/pros/{slug}/holds', () => {
  it('holds the hour for 10 minutes: hold item + one hold lock per 5-minute unit in one transaction', async () => {
    mockPro();
    const res = await handler(hold(START));
    expect(res.statusCode).toBe(200);
    const expiresAt = NOW.getTime() + 10 * 60_000;
    expect(parse(res)).toEqual({ expiresAt: new Date(expiresAt).toISOString() });

    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(tx).toHaveLength(9);
    expect(tx[0].Put!.Item).toMatchObject({
      ...holdKey(PRO_ID, HOLD_ID), holdId: HOLD_ID, serviceId: service.id, start: START, end: '2026-10-21T15:30:00.000Z',
      durationMin: 30, bufferMin: 10, expiresAt, ttl: expiresAt / 1000 + 3600,
    });
    const locks = tx.slice(1).map((t) => t.Put!);
    expect(locks.map((l) => l.Item!.SK)).toEqual(['10:00', '10:05', '10:10', '10:15', '10:20', '10:25', '10:30', '10:35']);
    expect(locks.every((l) => l.Item!.holdId === HOLD_ID && l.Item!.holdExpiresAt === expiresAt && l.Item!.apptId === undefined)).toBe(true);
    expect(locks.every((l) => l.ConditionExpression === LOCK_FREE)).toBe(true);
    expect(locks[0].ExpressionAttributeValues).toEqual({ ':now': NOW.getTime(), ':hold': HOLD_ID });
  });

  it('an hour that is booked or held by someone else is slot_taken', async () => {
    mockPro();
    ddb.on(QueryCommand, HOLDS_QUERY).resolves({ Items: [liveHold('other-hold')] });
    expect(parse(await handler(hold(START))).error.code).toBe('slot_taken');
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('ignores expired holds and its own hold', async () => {
    mockPro();
    ddb.on(QueryCommand, HOLDS_QUERY).resolves({ Items: [liveHold('other-hold', { expiresAt: NOW.getTime() - 1 }), liveHold(HOLD_ID)] });
    expect((await handler(hold(START))).statusCode).toBe(200);
  });

  it('maps a lock that someone took meanwhile to slot_taken', async () => {
    mockPro();
    ddb.on(TransactWriteCommand).rejects(canceledTx(['None', 'ConditionalCheckFailed']));
    const res = await handler(hold(START));
    expect(res.statusCode).toBe(409);
    expect(parse(res).error.code).toBe('slot_taken');
  });

  it('a new hold with the same id frees the units the old one no longer covers', async () => {
    mockPro();
    ddb.on(GetCommand, { Key: holdKey(PRO_ID, HOLD_ID) }).resolves({
      Item: { ...liveHold(HOLD_ID), durationMin: 30, bufferMin: 10 },
    });
    ddb.on(DeleteCommand).resolves({});
    // 10:30 instead of 10:00: 10:30 and 10:35 are shared, the six before are released.
    expect((await handler(hold('2026-10-21T15:30:00.000Z'))).statusCode).toBe(200);
    const released = ddb.commandCalls(DeleteCommand).map((c) => c.args[0].input);
    expect(released.map((d) => d.Key!.SK)).toEqual(['10:00', '10:05', '10:10', '10:15', '10:20', '10:25']);
    expect(released.every((d) => d.ConditionExpression === 'holdId = :hold' && d.ExpressionAttributeValues![':hold'] === HOLD_ID)).toBe(true);
  });

  it('refuses holds when the agenda is not taking bookings, and rate-limits per IP', async () => {
    mockPro(subItem({ trialEndsAt: '2026-10-01T00:00:00.000Z' }));
    expect(parse(await handler(hold(START))).error.code).toBe('agenda_unavailable');

    mockPro();
    ddb.on(UpdateCommand).rejects(Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' }));
    expect((await handler(hold(START))).statusCode).toBe(429);
  });

  it('validates the hold id', async () => {
    mockPro();
    const res = await handler(hold(START, 'nope'));
    expect(res.statusCode).toBe(400);
    expect(parse(res).error.fields).toHaveProperty('holdId');
  });
});

describe('appointments booked with the old 10-minute margin', () => {
  // A 9:30–10:00 appointment from before 29-oct still locks 10:00 and 10:05 (its old tail).
  const legacy = { id: 'old1', start: '2026-10-21T14:30:00.000Z', durationMin: 30, lockBufferMin: 10 };

  it('a booking right after it trims the stale tail and goes through on the retry', async () => {
    mockPro();
    ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: { schedule: settings.schedule, rules: { ...settings.rules, bufferMin: 0 }, rulesVersion: 2 } });
    ddb.on(QueryCommand, { IndexName: 'lsi1-start', ProjectionExpression: 'id, #s, durationMin, lockBufferMin' }).resolves({ Items: [legacy] });
    ddb.on(TransactWriteCommand)
      .rejectsOnce(canceledTx(['None', 'ConditionalCheckFailed']))
      .resolves({});
    const res = await handler(booking(START));
    expect(res.statusCode).toBe(201);
    const txs = ddb.commandCalls(TransactWriteCommand).map((c) => c.args[0].input.TransactItems!);
    // 1st: the booking (refused) · 2nd: the trim · 3rd: the booking again.
    expect(txs).toHaveLength(3);
    expect(txs[1][0].Update).toMatchObject({ Key: apptKey(PRO_ID, 'old1'), UpdateExpression: 'SET lockBufferMin = :new', ExpressionAttributeValues: { ':new': 0, ':old': 10 } });
    expect(txs[1].slice(1).map((t) => t.Delete!.Key!.SK)).toEqual(['10:00', '10:05']);
    expect(txs[2]).toEqual(txs[0]);
  });

  it('a real conflict (nothing stale to trim) is still slot_taken', async () => {
    mockPro();
    ddb.on(TransactWriteCommand).rejects(canceledTx(['None', 'ConditionalCheckFailed']));
    const res = await handler(booking(START));
    expect(parse(res).error.code).toBe('slot_taken');
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });
});


describe('DELETE /public/pros/{slug}/holds/{holdId}', () => {
  const release = (holdId: string) => apiEvent('DELETE /public/pros/{slug}/holds/{holdId}', { path: { slug: profile.slug, holdId } });

  it('frees the hold item and its lock units at once (only units it still owns)', async () => {
    mockPro();
    ddb.on(GetCommand, { Key: holdKey(PRO_ID, HOLD_ID) }).resolves({ Item: { ...liveHold(HOLD_ID), durationMin: 30, bufferMin: 0 } });
    ddb.on(DeleteCommand).resolves({});
    const res = await handler(release(HOLD_ID));
    expect(res.statusCode).toBe(204);
    const deletes = ddb.commandCalls(DeleteCommand).map((c) => c.args[0].input);
    expect(deletes[0].Key).toEqual(holdKey(PRO_ID, HOLD_ID));
    expect(deletes.slice(1).map((d) => d.Key!.SK)).toEqual(['10:00', '10:05', '10:10', '10:15', '10:20', '10:25']);
    expect(deletes.slice(1).every((d) => d.ConditionExpression === 'holdId = :hold')).toBe(true);
  });

  it('an unknown hold is a no-op; a malformed id is 400', async () => {
    mockPro();
    expect((await handler(release(HOLD_ID))).statusCode).toBe(204);
    expect(ddb.commandCalls(DeleteCommand)).toHaveLength(0);
    expect((await handler(release('nope'))).statusCode).toBe(400);
  });
});
