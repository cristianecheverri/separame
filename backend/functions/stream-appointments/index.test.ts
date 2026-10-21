import { marshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mods = vi.hoisted(() => ({
  emails: vi.fn(), clients: vi.fn(), waitlist: vi.fn(), push: vi.fn(), waitJoin: vi.fn(), waitPush: vi.fn(),
}));
vi.mock('../../services/stream/emails', () => ({ processAppointmentChange: mods.emails }));
vi.mock('../../services/stream/clients', () => ({ clientsOnAppointment: mods.clients }));
vi.mock('../../services/stream/waitlist', () => ({ waitlistOnAppointment: mods.waitlist, waitlistOnJoin: mods.waitJoin }));
vi.mock('../../services/stream/push', () => ({ pushOnAppointment: mods.push, pushOnWaitlistJoin: mods.waitPush }));

import { setTestEnv } from '../../testing/fixtures';
import { handler } from './index';

setTestEnv();

const legacyAppt = {
  PK: 'PRO#p1', SK: 'APPT#a1', id: 'a1', proId: 'p1', status: 'confirmed', start: '2026-10-22T15:00:00.000Z',
  client: { name: 'M', email: 'm@correo.com', phone: '' }, createdBy: 'client', createdAt: 'x', updatedAt: 'x',
};

const record = (sk: string, eventName: 'INSERT' | 'MODIFY', newImage: Record<string, unknown>, seq: string, approx?: number) => ({
  eventID: seq,
  eventName,
  dynamodb: {
    Keys: { PK: { S: 'PRO#p1' }, SK: { S: sk } },
    SequenceNumber: seq,
    NewImage: marshall(newImage),
    ...(approx ? { ApproximateCreationDateTime: approx } : {}),
  },
});

beforeEach(() => {
  for (const fn of Object.values(mods)) {
    fn.mockReset();
    fn.mockResolvedValue(undefined);
  }
});

describe('stream-appointments', () => {
  it('runs every module with normalized images and the record time', async () => {
    const res = await handler({ Records: [record('APPT#a1', 'INSERT', legacyAppt, '1', 1_760_000_000)] } as unknown as DynamoDBStreamEvent);
    expect(res.batchItemFailures).toEqual([]);
    const after = mods.clients.mock.calls[0][0];
    expect(after).toMatchObject({ clientConfirmation: 'pending', revision: 0 });
    expect(after.clientKey).toMatch(/^[0-9a-f]{24}$/);
    expect(mods.emails).toHaveBeenCalledOnce();
    expect(mods.waitlist).toHaveBeenCalledOnce();
    expect(mods.push.mock.calls[0][2]).toEqual(new Date(1_760_000_000 * 1000));
  });

  it('one failing module does not stop the others; the record is reported for retry and the batch stops there', async () => {
    mods.clients.mockRejectedValueOnce(new Error('boom'));
    const res = await handler({
      Records: [record('APPT#a1', 'INSERT', legacyAppt, '1'), record('APPT#a2', 'INSERT', { ...legacyAppt, SK: 'APPT#a2', id: 'a2' }, '2')],
    } as unknown as DynamoDBStreamEvent);
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: '1' }]);
    expect(mods.emails).toHaveBeenCalledOnce();
    expect(mods.waitlist).toHaveBeenCalledOnce();
    expect(mods.push).toHaveBeenCalledOnce();
  });

  it('WAIT inserts go to the waitlist (email) and push modules only', async () => {
    const wait = { PK: 'PRO#p1', SK: 'WAIT#w1', id: 'w1', proId: 'p1', status: 'waiting', dates: ['2026-10-22'], client: { name: 'M', email: '', phone: '' } };
    await handler({ Records: [record('WAIT#w1', 'INSERT', wait, '9'), record('WAIT#w1', 'MODIFY', wait, '10')] } as unknown as DynamoDBStreamEvent);
    expect(mods.waitJoin).toHaveBeenCalledOnce();
    expect(mods.waitPush).toHaveBeenCalledOnce();
    expect(mods.emails).not.toHaveBeenCalled();
  });
});
