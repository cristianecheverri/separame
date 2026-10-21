import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apptKey, profileKey, settingsKey, subKey } from '../../lib/keys';
import { signManageToken, tokenExpiryFor } from '../../lib/tokens';
import type { AppointmentItem } from '../../services/appointments';
import { apiEvent, parse, PRO_ID, profile, settings, setTestEnv, subItem } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ssm = mockClient(SSMClient);
const NOW = new Date('2026-10-19T13:00:00.000Z');

const appt: AppointmentItem = {
  id: 'appt1', proId: PRO_ID, serviceId: 'svc1', serviceName: 'Valoración', durationMin: 30, priceCop: 60000,
  start: '2026-10-21T15:00:00.000Z', end: '2026-10-21T15:30:00.000Z', status: 'confirmed',
  client: { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' },
  createdBy: 'client', createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', lockBufferMin: 10,
  clientConfirmation: 'pending', revision: 0, clientKey: 'k1',
};
const token = signManageToken({ p: PRO_ID, a: appt.id, e: tokenExpiryFor(appt.end) }, 'link-secret');

function mockData(sub = subItem(), item: AppointmentItem = appt) {
  ddb.on(GetCommand, { Key: apptKey(PRO_ID, appt.id) }).resolves({ Item: { ...apptKey(PRO_ID, appt.id), ...item } });
  ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
  ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: sub });
  ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: settings });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(UpdateCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  ddb.reset();
  ssm.reset();
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'link-secret' } });
});
afterEach(() => vi.useRealTimers());

describe('client manage link', () => {
  it('GET returns the booking with the change deadline', async () => {
    mockData();
    const res = await handler(apiEvent('GET /public/appointments/{token}', { path: { token } }));
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toMatchObject({ canChange: true, changeDeadline: '2026-10-21T13:00:00.000Z', booking: { appointmentId: 'appt1' } });
  });

  it('GET …/ics downloads the client calendar file', async () => {
    mockData();
    const res = await handler(apiEvent('GET /public/appointments/{token}/ics', { path: { token } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="cita-dra-laura-perez.ics"',
      'cache-control': 'no-store',
    });
    const body = String(res.body);
    expect(body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(body).toContain('METHOD:PUBLISH');
    expect(body).toContain('UID:appt1@separame.app');
    expect(body).toContain('DTSTART:20261021T150000Z');
    expect(body).toContain('SUMMARY:Valoración con Dra. Laura Pérez');
    expect(body).toContain('URL:https://dev.separame.app/c/');
    expect(body).toContain('BEGIN:VALARM');
  });

  it('GET …/ics rejects a forged token with 404', async () => {
    mockData();
    const res = await handler(apiEvent('GET /public/appointments/{token}/ics', { path: { token: `${token}x` } }));
    expect(res.statusCode).toBe(404);
  });

  it('rejects a forged token with 404', async () => {
    mockData();
    const res = await handler(apiEvent('GET /public/appointments/{token}', { path: { token: `${token}x` } }));
    expect(res.statusCode).toBe(404);
  });

  it('cancel releases every lock and the reminder in one transaction — even with an expired plan', async () => {
    mockData(subItem({ trialEndsAt: '2026-09-01T00:00:00.000Z' }));
    const res = await handler(apiEvent('POST /public/appointments/{token}/cancel', { path: { token }, body: { reason: 'Viaje' } }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).booking.status).toBe('cancelled');

    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(tx).toHaveLength(9);
    const update = tx[0].Update!;
    expect(update.UpdateExpression).toContain('REMOVE #g2pk, #g2sk');
    expect(update.ExpressionAttributeValues).toMatchObject({ ':c': 'cancelled', ':by': 'client', ':r': 'Viaje', ':zero': 0, ':one': 1 });
    expect(update.UpdateExpression).toContain('revision = if_not_exists(revision, :zero) + :one');
    const deletes = tx.slice(1).map((t) => t.Delete!);
    expect(deletes.map((d) => d.Key!.SK)).toEqual(['10:00', '10:05', '10:10', '10:15', '10:20', '10:25', '10:30', '10:35']);
    expect(deletes[0].ConditionExpression).toBe('attribute_not_exists(PK) OR apptId = :a');
  });

  it('closes changes 2 hours before the appointment (too_late)', async () => {
    vi.setSystemTime(new Date('2026-10-21T13:30:00.000Z'));
    mockData();
    const res = await handler(apiEvent('POST /public/appointments/{token}/cancel', { path: { token }, body: {} }));
    expect(res.statusCode).toBe(422);
    expect(parse(res).error.code).toBe('too_late');
  });

  it('reschedule diffs the locks and moves the reminder', async () => {
    mockData();
    // 10:00 → 10:30 the same day: 10:00–10:25 released, 10:40–11:05 acquired, 10:30/10:35 kept.
    const res = await handler(apiEvent('POST /public/appointments/{token}/reschedule', { path: { token }, body: { start: '2026-10-21T15:30:00.000Z' } }));
    expect(res.statusCode).toBe(200);
    const tx = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    const puts = tx.filter((t) => t.Put).map((t) => t.Put!.Item!.SK);
    const deletes = tx.filter((t) => t.Delete).map((t) => t.Delete!.Key!.SK);
    expect(deletes).toEqual(['10:00', '10:05', '10:10', '10:15', '10:20', '10:25']);
    expect(puts).toEqual(['10:40', '10:45', '10:50', '10:55', '11:00', '11:05']);
    expect(tx.filter((t) => t.Put).every((t) => t.Put!.Item!.ttl === Date.parse('2026-10-28T16:10:00.000Z') / 1000)).toBe(true);
    expect(tx[0].Update!.ExpressionAttributeValues).toMatchObject({
      ':start': '2026-10-21T15:30:00.000Z', ':lsi': 'APPT#2026-10-21T15:30:00.000Z', ':g2pk': 'REMIND#2026-10-20', ':zero': 0, ':one': 1,
    });
    expect(tx[0].Update!.UpdateExpression).toContain('revision = if_not_exists(revision, :zero) + :one');
  });

  it('reschedule needs an active agenda (agenda_unavailable)', async () => {
    mockData(subItem({ trialEndsAt: '2026-09-01T00:00:00.000Z' }));
    const res = await handler(apiEvent('POST /public/appointments/{token}/reschedule', { path: { token }, body: { start: '2026-10-21T15:30:00.000Z' } }));
    expect(parse(res).error.code).toBe('agenda_unavailable');
  });
});

describe('attendance confirmation ("Sí, voy")', () => {
  const confirm = () => handler(apiEvent('POST /public/appointments/{token}/confirm', { path: { token } }));

  it('sets clientConfirmation + confirmedAt without bumping the revision — even with an expired plan', async () => {
    mockData(subItem({ trialEndsAt: '2026-09-01T00:00:00.000Z' }));
    const res = await confirm();
    expect(res.statusCode).toBe(200);
    expect(parse(res).booking.clientConfirmation).toBe('confirmed');
    const update = ddb.commandCalls(UpdateCommand).find((c) => c.args[0].input.Key!.SK === 'APPT#appt1')!.args[0].input;
    expect(update.UpdateExpression).toBe('SET clientConfirmation = :c, confirmedAt = :at, updatedAt = :at');
    expect(update.UpdateExpression).not.toContain('revision');
    expect(update.ConditionExpression).toBe('#st = :confirmed AND #start = :start');
  });

  it('is idempotent', async () => {
    mockData(subItem(), { ...appt, clientConfirmation: 'confirmed', confirmedAt: '2026-10-19T12:00:00.000Z' });
    const res = await confirm();
    expect(parse(res).booking.clientConfirmation).toBe('confirmed');
    expect(ddb.commandCalls(UpdateCommand).filter((c) => c.args[0].input.Key!.SK === 'APPT#appt1')).toHaveLength(0);
  });

  it('is too late once the appointment started, or when cancelled', async () => {
    vi.setSystemTime(new Date('2026-10-21T15:01:00.000Z'));
    mockData();
    expect(parse(await confirm()).error.code).toBe('too_late');
    vi.setSystemTime(NOW);
    mockData(subItem(), { ...appt, status: 'cancelled' });
    expect((await confirm()).statusCode).toBe(422);
  });
});
