import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calFeedKey, calSyncKey, ownerKey, profileKey, subKey } from '../../lib/keys';
import type { AppointmentItem } from '../../services/appointments';
import { apiEvent, parse, PRO_ID, proClaims, profile, setTestEnv, SUB_ID, subItem } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const NOW = new Date('2026-10-21T15:00:00.000Z');
const TOKEN = 'A'.repeat(43);

const base: AppointmentItem = {
  id: 'appt1', proId: PRO_ID, serviceId: 'svc1', serviceName: 'Valoración', durationMin: 30, priceCop: 60000,
  start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T15:30:00.000Z', status: 'confirmed',
  client: { name: 'Mariana Gómez; "M"', email: 'mariana@correo.com', phone: '3001234567' },
  createdBy: 'client', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', lockBufferMin: 10, revision: 2,
};
const recentCancel: AppointmentItem = { ...base, id: 'appt2', status: 'cancelled', updatedAt: '2026-10-15T00:00:00.000Z', revision: 1 };
const oldCancel: AppointmentItem = { ...base, id: 'appt3', status: 'cancelled', updatedAt: '2026-09-01T00:00:00.000Z' };

const feed = (file: string) => apiEvent('GET /public/calendar/{file}', { path: { file } });
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: calFeedKey(TOKEN) }).resolves({ Item: { proId: PRO_ID } });
  ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
  ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: '2026-01-01T00:00:00.000Z' }) });
  ddb.on(GetCommand, { Key: ownerKey(SUB_ID) }).resolves({ Item: { proId: PRO_ID } });
  ddb.on(QueryCommand).resolves({ Items: [base, recentCancel, oldCancel] });
  ddb.on(TransactWriteCommand).resolves({});
});
afterEach(() => vi.useRealTimers());

describe('GET /public/calendar/{file}', () => {
  it('serves an RFC 5545 feed (even with an expired plan)', async () => {
    const res = await handler(feed(`${TOKEN}.ics`));
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="separame.ics"',
      'cache-control': 'private, max-age=300',
    });
    const body = res.body!;
    expect(body.endsWith('\r\n')).toBe(true);
    expect(body.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(body.replace(/\r\n/g, '')).not.toMatch(/\n/);
    const ics = unfold(body);
    for (const line of [
      'PRODID:-//Sepárame//Agenda//ES', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Sepárame · Dra. Laura Pérez',
      'X-WR-TIMEZONE:America/Bogota', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
      'UID:appt1@separame.app', 'DTSTART:20261022T150000Z', 'DTEND:20261022T153000Z', 'SEQUENCE:2', 'TRANSP:OPAQUE',
      'SUMMARY:Valoración · Mariana Gómez\\; "M"',
      'LOCATION:Cra. 43A #1-50\\, consultorio 302\\, El Poblado\\, Medellín',
      'DESCRIPTION:Cliente: Mariana Gómez\\; "M"\\nCelular: +57 300 123 4567\\nCorreo: mariana@correo.com\\nReservada por el cliente en tu página de Sepárame\\nVer en Sepárame: https://dev.separame.app/app/appointments',
    ]) expect(ics).toContain(line);
    // Recently cancelled → STATUS:CANCELLED; cancelled long ago → left out.
    expect(ics).toContain('UID:appt2@separame.app');
    expect(ics.split('BEGIN:VEVENT')[2]).toContain('STATUS:CANCELLED');
    expect(ics).not.toContain('UID:appt3@separame.app');
  });

  it('queries LSI1 over [today − 30 d, today + 365 d]', async () => {
    await handler(feed(`${TOKEN}.ics`));
    const values = ddb.commandCalls(QueryCommand)[0].args[0].input.ExpressionAttributeValues!;
    expect(values[':from']).toBe('APPT#2026-09-21T05:00:00.000Z');
    expect(values[':to']).toBe('APPT#2027-10-22T05:00:00.000Z');
  });

  it('404 for malformed or unknown tokens', async () => {
    for (const file of ['short.ics', `${TOKEN}.txt`, `${TOKEN.slice(0, 20)}!!!!!!!!!!!!!!!!.ics`, `${'B'.repeat(43)}.ics`]) {
      expect((await handler(feed(file))).statusCode).toBe(404);
    }
  });
});

describe('settings', () => {
  it('creates the feed on first GET (CALSYNC + CALFEED, conditional) and returns the links', async () => {
    const res = await handler(apiEvent('GET /me/calendar-sync', { claims: proClaims }));
    expect(res.statusCode).toBe(200);
    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    const token = tx[0].Put!.Item!.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tx[0].Put!.Item).toMatchObject({ ...calSyncKey(PRO_ID), invitesEnabled: true });
    expect(tx[1].Put!.Item).toMatchObject({ ...calFeedKey(token), proId: PRO_ID });
    expect(tx.every((t) => t.Put!.ConditionExpression === 'attribute_not_exists(PK)')).toBe(true);
    const body = parse(res);
    expect(body.feedUrl).toBe(`https://api.dev.separame.app/public/calendar/${token}.ics`);
    expect(body.webcalUrl).toBe(`webcal://api.dev.separame.app/public/calendar/${token}.ics`);
    expect(body.googleUrl).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(body.webcalUrl)}`);
    expect(body.outlookUrl).toBe(`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(body.feedUrl)}&name=Sep%C3%A1rame`);
    expect(body.invitesEnabled).toBe(true);
  });

  it('returns the existing settings without writing', async () => {
    ddb.on(GetCommand, { Key: calSyncKey(PRO_ID) }).resolves({ Item: { token: TOKEN, invitesEnabled: false, createdAt: '2026-10-01T00:00:00.000Z' } });
    const body = parse(await handler(apiEvent('GET /me/calendar-sync', { claims: proClaims })));
    expect(body).toMatchObject({ invitesEnabled: false, createdAt: '2026-10-01T00:00:00.000Z' });
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('PUT toggles invitations (allowed while read-only)', async () => {
    ddb.on(GetCommand, { Key: calSyncKey(PRO_ID) }).resolves({ Item: { token: TOKEN, invitesEnabled: true, createdAt: 'x' } });
    ddb.on(UpdateCommand).resolves({ Attributes: { token: TOKEN, invitesEnabled: false, createdAt: 'x' } });
    const res = await handler(apiEvent('PUT /me/calendar-sync', { claims: proClaims, body: { invitesEnabled: false } }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).invitesEnabled).toBe(false);
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues).toEqual({ ':e': false });
  });

  it('rotate swaps the token atomically: the old feed URL is deleted', async () => {
    ddb.on(GetCommand, { Key: calSyncKey(PRO_ID) }).resolves({ Item: { token: TOKEN, invitesEnabled: true, createdAt: 'x' } });
    const res = await handler(apiEvent('POST /me/calendar-sync/rotate', { claims: proClaims }));
    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    const newToken = tx[0].Put!.Item!.PK.replace('CALFEED#', '');
    expect(newToken).not.toBe(TOKEN);
    expect(tx[1].Delete!.Key).toEqual(calFeedKey(TOKEN));
    expect(tx[2].Update!.ExpressionAttributeValues).toEqual({ ':new': newToken, ':old': TOKEN });
    expect(parse(res).feedUrl).toContain(`${newToken}.ics`);

    // After rotation the old token no longer resolves.
    ddb.on(GetCommand, { Key: calFeedKey(TOKEN) }).resolves({});
    expect((await handler(feed(`${TOKEN}.ics`))).statusCode).toBe(404);
  });
});
