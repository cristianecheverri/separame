import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { apptKey, profileKey } from '../lib/keys';
import { conditionalFailure, PRO_ID, profile, setTestEnv, subItem } from '../testing/fixtures';
import type { AppointmentItem } from './appointments';
import { parseRemindSk, sendDueReminders, sendRenewalNotices } from './jobs';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const ssm = mockClient(SSMClient);
const NOW = new Date('2026-10-21T15:05:00.000Z');

const appt: AppointmentItem = {
  id: 'appt1', proId: PRO_ID, serviceId: 'svc1', serviceName: 'Valoración', durationMin: 30, priceCop: null,
  start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T15:30:00.000Z', status: 'confirmed',
  client: { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' },
  createdBy: 'client', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', lockBufferMin: 10,
  clientConfirmation: 'pending', revision: 0, clientKey: 'k1',
};

beforeEach(() => {
  ddb.reset();
  ses.reset();
  ssm.reset();
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'link-secret' } });
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
  ddb.on(PutCommand).resolves({});
  ddb.on(DeleteCommand).resolves({});
  ddb.on(UpdateCommand).resolves({});
  ses.on(SendEmailCommand).resolves({});
});

describe('reminders', () => {
  it('parses the GSI2 sort key', () => {
    expect(parseRemindSk(`2026-10-21T15:00:00.000Z#${PRO_ID}#appt1`)).toEqual({ proId: PRO_ID, apptId: 'appt1' });
  });

  it('sends due reminders then clears the GSI2 attributes conditionally', async () => {
    ddb.on(QueryCommand).resolvesOnce({ Items: [] }).resolves({ Items: [{ GSI2SK: `2026-10-21T15:00:00.000Z#${PRO_ID}#appt1` }] });
    ddb.on(GetCommand, { Key: apptKey(PRO_ID, 'appt1') }).resolves({ Item: appt });
    expect(await sendDueReminders(NOW, 10)).toBe(1);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(1);
    const update = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(update.UpdateExpression).toBe('SET reminderSentAt = :now REMOVE #g2pk, #g2sk');
    expect(update.ConditionExpression).toBe('attribute_exists(#g2pk)');
  });

  it('skips cancelled appointments (no email) but still clears the marker', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ GSI2SK: `2026-10-21T15:00:00.000Z#${PRO_ID}#appt1` }] });
    ddb.on(GetCommand, { Key: apptKey(PRO_ID, 'appt1') }).resolves({ Item: { ...appt, status: 'cancelled' } });
    await sendDueReminders(NOW, 10);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });
});

describe('renewal notices', () => {
  it('claims renewalNoticeFor once per accessUntil and sends', async () => {
    ddb.on(QueryCommand).resolves({ Items: [subItem({ trialEndsAt: '2026-10-23T15:00:00.000Z' })] });
    expect(await sendRenewalNotices(NOW, 10)).toBe(1);
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues).toEqual({ ':au': '2026-10-23T15:00:00.000Z' });
  });

  it('does not resend when another run already claimed it', async () => {
    ddb.on(QueryCommand).resolves({ Items: [subItem({ trialEndsAt: '2026-10-23T15:00:00.000Z' })] });
    ddb.on(UpdateCommand).rejects(conditionalFailure());
    expect(await sendRenewalNotices(NOW, 10)).toBe(0);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });
});
