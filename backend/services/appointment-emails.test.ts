import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { profileKey } from '../lib/keys';
import { conditionalFailure, PRO_ID, profile, setTestEnv } from '../testing/fixtures';
import { handler } from '../functions/stream-emails/index';
import type { AppointmentItem } from './appointments';
import { decideEmails } from './appointment-emails';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const ssm = mockClient(SSMClient);

const appt: AppointmentItem = {
  id: 'appt1', proId: PRO_ID, serviceId: 'svc1', serviceName: 'Valoración', durationMin: 30, priceCop: 60000,
  start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T15:30:00.000Z', status: 'confirmed',
  client: { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' },
  createdBy: 'client', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', lockBufferMin: 10, lastChangedBy: 'client',
};

describe('decideEmails', () => {
  it('INSERT by a client: confirmation + "Nueva cita" for the pro', () => {
    expect(decideEmails(undefined, appt)).toEqual(['client-confirmed', 'pro-new-booking']);
  });

  it('INSERT by the pro without client email: nothing', () => {
    expect(decideEmails(undefined, { ...appt, createdBy: 'pro', client: { ...appt.client, email: '' } })).toEqual([]);
  });

  it('INSERT by the pro with client email: only the client confirmation', () => {
    expect(decideEmails(undefined, { ...appt, createdBy: 'pro' })).toEqual(['client-confirmed']);
  });

  it('move by the client: client gets the new date, the pro a notice', () => {
    expect(decideEmails(appt, { ...appt, start: '2026-10-22T16:00:00.000Z' })).toEqual(['client-changed', 'pro-changed']);
  });

  it('move by the pro: only the client', () => {
    expect(decideEmails(appt, { ...appt, start: '2026-10-22T16:00:00.000Z', lastChangedBy: 'pro' })).toEqual(['client-changed']);
  });

  it('cancel notifies the other party', () => {
    expect(decideEmails(appt, { ...appt, status: 'cancelled', cancelledBy: 'client' })).toEqual(['pro-cancelled']);
    expect(decideEmails(appt, { ...appt, status: 'cancelled', cancelledBy: 'pro' })).toEqual(['client-cancelled']);
    expect(decideEmails(appt, { ...appt, status: 'cancelled', cancelledBy: 'admin' })).toEqual(['client-cancelled', 'pro-cancelled']);
  });

  it('reminder bookkeeping changes send nothing', () => {
    const sent: AppointmentItem = { ...appt, reminderSentAt: '2026-10-21T15:00:00.000Z' };
    expect(decideEmails(appt, sent)).toEqual([]);
  });
});

function streamEvent(oldItem: AppointmentItem | undefined, newItem: AppointmentItem, seq = '100'): DynamoDBStreamEvent {
  const image = (i: AppointmentItem) => marshall({ PK: `PRO#${PRO_ID}`, SK: `APPT#${i.id}`, ...i }, { removeUndefinedValues: true });
  return {
    Records: [{
      eventID: 'e1',
      eventName: oldItem ? 'MODIFY' : 'INSERT',
      dynamodb: {
        Keys: { PK: { S: `PRO#${PRO_ID}` }, SK: { S: `APPT#${newItem.id}` } },
        SequenceNumber: seq,
        ...(oldItem ? { OldImage: image(oldItem) } : {}),
        NewImage: image(newItem),
      },
    }],
  } as unknown as DynamoDBStreamEvent;
}

describe('stream-emails handler', () => {
  beforeEach(() => {
    ddb.reset();
    ses.reset();
    ssm.reset();
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'link-secret' } });
    ddb.on(GetCommand).resolves({});
    ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
    ddb.on(PutCommand).resolves({});
    ddb.on(DeleteCommand).resolves({});
    ses.on(SendEmailCommand).resolves({ MessageId: 'm1' });
  });

  it('sends the confirmation (raw MIME with .ics, reply-to the pro) and the pro notice', async () => {
    const res = await handler(streamEvent(undefined, appt));
    expect(res.batchItemFailures).toEqual([]);
    const calls = ses.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(2);
    const raw = Buffer.from(calls[0].args[0].input.Content!.Raw!.Data!).toString('utf8');
    expect(raw).toContain('To: mariana@correo.com');
    expect(raw).toContain('Reply-To: laura@correo.com');
    expect(raw).toContain('From: =?UTF-8?B?');
    expect(raw).toContain('filename="cita-dra-laura-perez.ics"');
    expect(calls[0].args[0].input.ConfigurationSetName).toBe('separame-test');
    expect(calls[1].args[0].input.Destination!.ToAddresses).toEqual(['laura@correo.com']);
    expect(calls[1].args[0].input.Content!.Simple!.Subject!.Data).toBe('Nueva cita · jue 22 oct., 10:00 a. m. · Mariana Gómez');
    // One idempotency marker per email.
    const markers = ddb.commandCalls(PutCommand).map((c) => c.args[0].input.Item!.PK);
    expect(markers).toEqual(['EMAIL#appt1#client-confirmed#2026-10-20T00:00:00.000Z', 'EMAIL#appt1#pro-new-booking#2026-10-20T00:00:00.000Z']);
  });

  it('skips emails whose marker already exists (stream retry)', async () => {
    ddb.on(PutCommand).rejects(conditionalFailure());
    await handler(streamEvent(undefined, appt));
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  it('reports the failed record and frees its marker so the retry can send', async () => {
    ses.on(SendEmailCommand).rejects(new Error('SES throttled'));
    const res = await handler(streamEvent(undefined, appt, '777'));
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: '777' }]);
    expect(ddb.commandCalls(DeleteCommand)).toHaveLength(1);
  });

  it('does not email suppressed addresses', async () => {
    ddb.on(GetCommand, { Key: { PK: 'SUPPRESS#mariana@correo.com', SK: 'SUPPRESS' } }).resolves({ Item: { email: 'mariana@correo.com' } });
    await handler(streamEvent(appt, { ...appt, status: 'cancelled', cancelledBy: 'pro', lastChangedBy: 'pro', updatedAt: '2026-10-20T01:00:00.000Z' }));
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });
});
