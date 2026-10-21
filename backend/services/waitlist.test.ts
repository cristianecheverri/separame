import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientKeyOf } from '../../shared/clients';
import { profileKey, serviceKey, settingsKey, slugKey, subKey } from '../lib/keys';
import { signWaitlistToken } from '../lib/tokens';
import { apiEvent, conditionalFailure, parse, PRO_ID, profile, service, settings, setTestEnv, subItem } from '../testing/fixtures';
import { handler } from '../functions/waitlist/index';
import type { AppointmentItem } from './appointments';
import { entryExpiry, markBookedFor, offerFreedDate, type WaitItem } from './waitlist';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const ssm = mockClient(SSMClient);
// Monday 19 Oct, 8:00 a. m. Bogotá.
const NOW = new Date('2026-10-19T13:00:00.000Z');
const client = { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' };
const KEY = clientKeyOf(client);

const entry = (id: string, createdAt: string, extra: Partial<WaitItem> = {}): WaitItem => ({
  id, proId: PRO_ID, serviceId: service.id, serviceName: service.name, dates: ['2026-10-21'], client: { ...client, email: `${id}@correo.com` },
  status: 'waiting', createdAt, notifiedCount: 0, lastNotifiedAt: null, clientKey: `${id}key`, offeredAt: {}, ttl: 0, ...extra,
});

const waitQuery = { ExpressionAttributeValues: { ':pk': `PRO#${PRO_ID}`, ':p': 'WAIT#' } };

const join = (body: Record<string, unknown>) => handler(apiEvent('POST /public/pros/{slug}/waitlist', {
  path: { slug: profile.slug },
  body: { serviceId: service.id, dates: ['2026-10-21', '2026-10-22'], client, consent: true, turnstileToken: 'tok', ...body },
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  ddb.reset();
  ses.reset();
  ssm.reset();
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'link-secret' } });
  ssm.on(GetParameterCommand, { Name: '/separame/dev/turnstile/secret-key' }).rejects(Object.assign(new Error('x'), { name: 'ParameterNotFound' }));
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: slugKey(profile.slug) }).resolves({ Item: { proId: PRO_ID } });
  ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
  ddb.on(GetCommand, { Key: serviceKey(PRO_ID, service.id) }).resolves({ Item: service });
  ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: settings });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(PutCommand).resolves({});
  ddb.on(UpdateCommand).resolves({});
  ses.on(SendEmailCommand).resolves({});
});
afterEach(() => vi.useRealTimers());

describe('join', () => {
  it('stores a waiting entry with clientKey and TTL = last date + 1 day', async () => {
    const res = await join({});
    expect(res.statusCode).toBe(201);
    expect(parse(res).entry).toMatchObject({ dates: ['2026-10-21', '2026-10-22'], serviceName: 'Valoración' });
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(item).toMatchObject({ SK: expect.stringMatching(/^WAIT#/), status: 'waiting', clientKey: KEY, notifiedCount: 0, offeredAt: {} });
    expect(item.ttl).toBe(Date.parse('2026-10-24T05:00:00.000Z') / 1000);
    expect(item.ttl).toBe(entryExpiry(['2026-10-22', '2026-10-21']));
  });

  it('rejects past dates and dates beyond the booking window', async () => {
    expect(parse(await join({ dates: ['2026-10-18'] })).error.fields.dates).toBeDefined();
    expect(parse(await join({ dates: ['2027-06-01'] })).error.fields.dates).toBeDefined();
  });

  it('allows at most 3 active entries per client', async () => {
    ddb.on(QueryCommand, waitQuery).resolves({ Items: [1, 2, 3].map((i) => entry(`w${i}`, NOW.toISOString(), { clientKey: KEY })) });
    expect(parse(await join({})).error.code).toBe('conflict');
  });

  it('needs an active agenda', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: '2026-01-01T00:00:00.000Z' }) });
    expect(parse(await join({})).error.code).toBe('agenda_unavailable');
  });
});

describe('leave', () => {
  it('marks the entry removed and is idempotent', async () => {
    ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
    const token = signWaitlistToken({ p: PRO_ID, w: 'w1', e: entryExpiry(['2026-10-21']) }, 'link-secret');
    const leave = (t = token) => handler(apiEvent('POST /public/waitlist/{token}/leave', { path: { token: t } }));
    const res = await leave();
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toEqual({ pro: { slug: 'dra-laura-perez', name: 'Dra. Laura Pérez' } });
    expect(ddb.commandCalls(UpdateCommand).find((c) => c.args[0].input.Key!.SK === 'WAIT#w1')!.args[0].input.ExpressionAttributeValues)
      .toEqual({ ':removed': 'removed', ':waiting': 'waiting' });
    // Already removed / booked → still 200.
    ddb.on(UpdateCommand, { Key: { PK: `PRO#${PRO_ID}`, SK: 'WAIT#w1' } }).rejects(conditionalFailure());
    expect((await leave()).statusCode).toBe(200);
    // Tampered or expired → 404.
    expect((await leave(`${token}x`)).statusCode).toBe(404);
    expect((await leave(signWaitlistToken({ p: PRO_ID, w: 'w1', e: 1 }, 'link-secret'))).statusCode).toBe(404);
  });
});

describe('offers', () => {
  it('offers a freed day to up to 3 waiting entries (FIFO) that now have a slot, once per change', async () => {
    const entries = [
      entry('w5', '2026-10-15T05:00:00.000Z'),
      entry('w1', '2026-10-10T05:00:00.000Z'),
      entry('w2', '2026-10-11T05:00:00.000Z', { offeredAt: { '2026-10-21': '2026-10-19T12:00:00.000Z' } }), // offered 1 h ago
      entry('w3', '2026-10-12T05:00:00.000Z'),
      entry('w4', '2026-10-13T05:00:00.000Z'),
      entry('w6', '2026-10-09T05:00:00.000Z', { dates: ['2026-10-22'] }),
    ];
    ddb.on(QueryCommand, waitQuery).resolves({ Items: entries });

    expect(await offerFreedDate(profile, '2026-10-21', 'appt9#1', NOW)).toBe(3);
    const to = ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input.Destination!.ToAddresses![0]);
    expect(to).toEqual(['w1@correo.com', 'w3@correo.com', 'w4@correo.com']);
    const subject = ses.commandCalls(SendEmailCommand)[0].args[0].input.Content!.Simple!.Subject!.Data;
    expect(subject).toBe('Se liberó un cupo el miércoles 21 de octubre: 8:00 a. m. (y otras horas)');
    const html = ses.commandCalls(SendEmailCommand)[0].args[0].input.Content!.Simple!.Body!.Html!.Data!;
    expect(html).toContain(`href="https://dev.separame.app/dra-laura-perez?service=svc1&amp;date=2026-10-21"`);
    expect(html).toContain('https://dev.separame.app/w/');
    const markers = ddb.commandCalls(PutCommand).map((c) => c.args[0].input.Item!.PK);
    expect(markers).toContain('EMAIL#wait-offer#w1#2026-10-21#appt9#1');
    const update = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(update.UpdateExpression).toContain('offeredAt.#d = :at');
    expect(update.UpdateExpression).toContain('notifiedCount = if_not_exists(notifiedCount, :zero) + :one');

    // Replay of the same change: markers exist → no new emails.
    ses.reset();
    ses.on(SendEmailCommand).resolves({});
    ddb.on(PutCommand).rejects(conditionalFailure());
    expect(await offerFreedDate(profile, '2026-10-21', 'appt9#1', NOW)).toBe(0);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  it('does not offer when the day is still full', async () => {
    ddb.on(QueryCommand, waitQuery).resolves({ Items: [entry('w1', '2026-10-10T05:00:00.000Z')] });
    ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: { ...settings, schedule: { ...settings.schedule, wed: [] } } });
    expect(await offerFreedDate(profile, '2026-10-21', 'appt9#1', NOW)).toBe(0);
  });

  it('a booking by a waiting client on one of their days marks the entry booked', async () => {
    ddb.on(QueryCommand, waitQuery).resolves({ Items: [entry('w1', '2026-10-10T05:00:00.000Z', { clientKey: KEY }), entry('w2', '2026-10-10T05:00:00.000Z')] });
    const appt = { proId: PRO_ID, clientKey: KEY } as AppointmentItem;
    expect(await markBookedFor(appt, '2026-10-21')).toBe(1);
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input).toMatchObject({ ConditionExpression: '#st = :waiting', ExpressionAttributeValues: { ':booked': 'booked', ':waiting': 'waiting' } });
  });
});
