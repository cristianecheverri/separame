import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { clientKeyOf } from '../../../shared/clients';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apptKey, bookingIdempotencyKey, serviceKey, settingsKey, slugKey, subKey, profileKey } from '../../lib/keys';
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
    expect(locks.every((l) => l.Item!.PK === `LOCK#${PRO_ID}#2026-10-21` && l.ConditionExpression === 'attribute_not_exists(PK)')).toBe(true);
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
