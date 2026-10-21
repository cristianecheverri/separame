import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apptKey, ownerKey, subKey } from '../../lib/keys';
import { apiEvent, parse, PRO_ID, proClaims, setTestEnv, SUB_ID, subItem } from '../../testing/fixtures';
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
});
