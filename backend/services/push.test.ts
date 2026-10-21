import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.hoisted(() => vi.fn());
vi.mock('web-push', () => ({
  sendNotification,
  WebPushError: class WebPushError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import { WebPushError } from 'web-push';
import { clearParamCache } from '../lib/ssm';
import { apiEvent, conditionalFailure, parse, PRO_ID, proClaims, setTestEnv, SUB_ID } from '../testing/fixtures';
import { handler } from '../functions/pro-notifications/index';
import { ownerKey } from '../lib/keys';
import type { AppointmentItem } from './appointments';
import { endpointHash, pushToPro, vapidSubject } from './push';
import { appointmentPayload, decidePush, pushOnAppointment, PUSH_MAX_AGE_MS } from './stream/push';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ssm = mockClient(SSMClient);
const NOW = new Date('2026-10-20T15:00:00.000Z');

const device = (n: number, createdAt = `2026-10-0${n}T00:00:00.000Z`) => ({
  endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'p', auth: 'a' }, deviceLabel: `Device ${n}`, createdAt, lastSuccessAt: null,
});

const appt = {
  id: 'appt1', proId: PRO_ID, status: 'confirmed', start: '2026-10-22T15:00:00.000Z', createdBy: 'client', lastChangedBy: 'client',
  clientConfirmation: 'pending', revision: 0, serviceName: 'Valoración', client: { name: 'Mariana Gómez', email: '', phone: '' },
} as unknown as AppointmentItem;

function withVapid(on = true) {
  clearParamCache();
  ssm.reset();
  if (on) ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'vapid-key' } });
  else ssm.on(GetParameterCommand).rejects(Object.assign(new Error('x'), { name: 'ParameterNotFound' }));
}

beforeEach(() => {
  ddb.reset();
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  withVapid();
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: ownerKey(SUB_ID) }).resolves({ Item: { proId: PRO_ID } });
  ddb.on(QueryCommand).resolves({ Items: [device(1), device(2)] });
  ddb.on(PutCommand).resolves({});
  ddb.on(UpdateCommand).resolves({});
  ddb.on(DeleteCommand).resolves({});
});

describe('decidePush', () => {
  it('notifies only client actions', () => {
    expect(decidePush(undefined, appt)).toBe('booked');
    expect(decidePush(undefined, { ...appt, createdBy: 'pro' })).toBeNull();
    expect(decidePush(appt, { ...appt, start: '2026-10-22T16:00:00.000Z' })).toBe('moved');
    expect(decidePush(appt, { ...appt, start: '2026-10-22T16:00:00.000Z', lastChangedBy: 'pro' })).toBeNull();
    expect(decidePush(appt, { ...appt, status: 'cancelled', cancelledBy: 'client' })).toBe('cancelled');
    expect(decidePush(appt, { ...appt, status: 'cancelled', cancelledBy: 'pro' })).toBeNull();
    expect(decidePush(appt, { ...appt, clientConfirmation: 'confirmed' })).toBe('confirmed');
  });

  it('builds the payload like the spec', () => {
    expect(appointmentPayload('booked', appt)).toEqual({
      title: 'Nueva cita', body: 'Jue 22 oct · 10:00 a. m. · Mariana Gómez · Valoración', url: '/app/', tag: 'appt1',
    });
  });
});

describe('pushToPro', () => {
  it('sends to every device with VAPID details and a 24 h TTL', async () => {
    expect(await pushToPro(PRO_ID, appointmentPayload('booked', appt), NOW)).toBe(2);
    const [sub, body, opts] = sendNotification.mock.calls[0];
    expect(sub).toEqual({ endpoint: 'https://push.example.com/1', keys: { p256dh: 'p', auth: 'a' } });
    expect(JSON.parse(body)).toMatchObject({ title: 'Nueva cita', tag: 'appt1' });
    expect(opts).toMatchObject({ TTL: 86400, vapidDetails: { subject: 'mailto:noreply@dev.separame.app', publicKey: 'vapid-key', privateKey: 'vapid-key' } });
    expect(vapidSubject()).toBe('mailto:noreply@dev.separame.app');
  });

  it('deletes expired subscriptions (404/410) and keeps going', async () => {
    sendNotification.mockRejectedValueOnce(new WebPushError('gone', 410, {}, '', 'https://push.example.com/1'));
    expect(await pushToPro(PRO_ID, appointmentPayload('booked', appt), NOW)).toBe(1);
    expect(ddb.commandCalls(DeleteCommand)[0].args[0].input.Key!.SK).toBe(`PUSH#${endpointHash('https://push.example.com/1')}`);
  });

  it('is a no-op without VAPID keys', async () => {
    withVapid(false);
    expect(await pushToPro(PRO_ID, appointmentPayload('booked', appt), NOW)).toBe(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});

describe('stream push module', () => {
  it('marks per (appointment, kind, revision) with a short TTL; replays do not re-notify', async () => {
    await pushOnAppointment(undefined, appt, NOW, NOW);
    const marker = ddb.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(marker.PK).toBe('EMAIL#push#appt1#booked#0');
    expect(marker.ttl).toBe(Math.floor(NOW.getTime() / 1000) + 2 * 86400);
    expect(sendNotification).toHaveBeenCalledTimes(2);

    sendNotification.mockClear();
    ddb.on(PutCommand).rejects(conditionalFailure());
    await pushOnAppointment(undefined, appt, NOW, NOW);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('skips events older than an hour', async () => {
    await pushOnAppointment(undefined, appt, new Date(NOW.getTime() - PUSH_MAX_AGE_MS - 1000), NOW);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });
});

describe('pro-notifications handler', () => {
  it('push-config: public key + devices; null key when not configured', async () => {
    const res = parse(await handler(apiEvent('GET /me/push-config', { claims: proClaims })));
    expect(res.vapidPublicKey).toBe('vapid-key');
    expect(res.devices[0]).toMatchObject({ deviceLabel: 'Device 2', endpointHash: endpointHash('https://push.example.com/2'), lastSuccessAt: null });
    withVapid(false);
    expect(parse(await handler(apiEvent('GET /me/push-config', { claims: proClaims }))).vapidPublicKey).toBeNull();
  });

  it('subscribe keeps at most 10 devices (drops the oldest)', async () => {
    ddb.on(QueryCommand).resolves({ Items: Array.from({ length: 10 }, (_, i) => device(i, `2026-10-${String(10 + i)}T00:00:00.000Z`)) });
    const res = await handler(apiEvent('POST /me/push-subscriptions', {
      claims: proClaims, body: { endpoint: 'https://push.example.com/new', keys: { p256dh: 'p', auth: 'a' }, deviceLabel: 'iPhone · Safari' },
    }));
    expect(res.statusCode).toBe(201);
    expect(ddb.commandCalls(DeleteCommand).map((c) => c.args[0].input.Key!.SK)).toEqual([`PUSH#${endpointHash('https://push.example.com/0')}`]);
    expect(ddb.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({
      SK: `PUSH#${endpointHash('https://push.example.com/new')}`, deviceLabel: 'iPhone · Safari', lastSuccessAt: null,
    });
  });

  it('test push sends "Las notificaciones de Sepárame están activas"', async () => {
    const res = parse(await handler(apiEvent('POST /me/push-subscriptions/test', { claims: proClaims })));
    expect(res.sent).toBe(2);
    expect(JSON.parse(sendNotification.mock.calls[0][1]).body).toBe('Las notificaciones de Sepárame están activas');
  });
});
