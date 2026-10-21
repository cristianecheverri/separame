import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { marshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { calSyncKey, profileKey } from '../../lib/keys';
import { conditionalFailure, PRO_ID, profile, setTestEnv } from '../../testing/fixtures';
import { handler } from '../../functions/stream-appointments/index';
import type { AppointmentItem } from '../appointments';
import { decideEmails, decideInvite } from './emails';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const ssm = mockClient(SSMClient);

const appt: AppointmentItem = {
  id: 'appt1', proId: PRO_ID, serviceId: 'svc1', serviceName: 'Valoración', durationMin: 30, priceCop: 60000,
  start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T15:30:00.000Z', status: 'confirmed',
  client: { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' },
  createdBy: 'client', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', lockBufferMin: 10, lastChangedBy: 'client',
  clientConfirmation: 'pending', revision: 0, clientKey: 'k1',
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

describe('decideInvite', () => {
  it('REQUEST for new and moved, CANCEL for cancelled, nothing for bookkeeping', () => {
    expect(decideInvite(undefined, appt)).toEqual({ method: 'REQUEST', standalone: 'added' });
    expect(decideInvite(appt, { ...appt, start: '2026-10-22T16:00:00.000Z' })).toEqual({ method: 'REQUEST', standalone: 'updated' });
    expect(decideInvite(appt, { ...appt, status: 'cancelled' })).toEqual({ method: 'CANCEL', standalone: 'removed' });
    expect(decideInvite(appt, { ...appt, reminderSentAt: 'x' } as AppointmentItem)).toBeNull();
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

const rawOf = (call: { args: [{ input: { Content?: { Raw?: { Data?: Uint8Array } } } }] }) =>
  Buffer.from(call.args[0].input.Content!.Raw!.Data!).toString('utf8');
const toOf = (raw: string) => /^To: (.+)$/m.exec(raw)?.[1];

/** Decodes every base64 MIME part with its headers. */
function parts(raw: string): { headers: string; body: string }[] {
  return raw.split(/\r\n--[a-z]+_[0-9a-f]+(?:--)?\r\n/).slice(1)
    .map((chunk) => {
      const [headers, ...rest] = chunk.split('\r\n\r\n');
      const encoded = rest.join('\r\n\r\n').replace(/\r\n/g, '');
      return { headers, body: /base64/.test(headers) ? Buffer.from(encoded, 'base64').toString('utf8') : encoded };
    });
}
/** The inline text/calendar part, unfolded (RFC 5545 continuation lines). */
function calendarPart(raw: string) {
  const part = parts(raw).find((p) => p.headers.startsWith('Content-Type: text/calendar'));
  return part ? { ...part, body: part.body.replace(/\r\n /g, '') } : undefined;
}

describe('stream-appointments: emails module', () => {
  beforeEach(() => {
    ddb.reset();
    ses.reset();
    ssm.reset();
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'link-secret' } });
    ddb.on(GetCommand).resolves({});
    ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
    ddb.on(PutCommand).resolves({});
    ddb.on(DeleteCommand).resolves({});
    // Other stream modules (clients, waitlist, push) find nothing to do.
    ddb.on(QueryCommand).resolves({ Items: [] });
    ddb.on(UpdateCommand).resolves({});
    ses.on(SendEmailCommand).resolves({ MessageId: 'm1' });
  });

  const emailMarkers = () => ddb.commandCalls(PutCommand).map((c) => c.args[0].input.Item!.PK as string).filter((pk) => pk.startsWith('EMAIL#appt1#'));

  it('client booking: confirmation (PUBLISH .ics, reply-to pro) + "Nueva cita" carrying a REQUEST invite', async () => {
    const res = await handler(streamEvent(undefined, appt));
    expect(res.batchItemFailures).toEqual([]);
    const calls = ses.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(2);

    const client = rawOf(calls[0]);
    expect(toOf(client)).toBe('mariana@correo.com');
    expect(client).toContain('Reply-To: laura@correo.com');
    expect(client).toContain('From: =?UTF-8?B?');
    expect(client).toContain('filename="cita-dra-laura-perez.ics"');
    expect(parts(client).find((p) => p.headers.includes('cita-dra-laura-perez.ics'))!.body).toContain('METHOD:PUBLISH');
    expect(calls[0].args[0].input.ConfigurationSetName).toBe('separame-test');

    const proRaw = rawOf(calls[1]);
    expect(toOf(proRaw)).toBe('laura@correo.com');
    expect(proRaw).toMatch(/Content-Type: multipart\/mixed[\s\S]*Content-Type: multipart\/alternative[\s\S]*text\/plain[\s\S]*text\/html[\s\S]*Content-Type: text\/calendar; method=REQUEST; charset=UTF-8[\s\S]*Content-Type: application\/ics; name="invite.ics"/);
    const ics = calendarPart(proRaw)!.body;
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('UID:appt1@separame.app');
    expect(ics).toContain('SEQUENCE:0');
    expect(ics).toContain('ORGANIZER;CN=Sepárame:mailto:noreply@dev.separame.app');
    expect(ics).toContain('ATTENDEE;CN=Dra. Laura Pérez;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:laura@correo.com');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(parts(proRaw).find((p) => p.headers.includes('invite.ics'))!.body.replace(/\r\n /g, '')).toBe(ics);

    expect(emailMarkers()).toEqual(['EMAIL#appt1#client-confirmed#2026-10-20T00:00:00.000Z', 'EMAIL#appt1#pro-new-booking#2026-10-20T00:00:00.000Z']);
  });

  it('pro creates it: client confirmation + short "Agregamos esta cita a tu calendario" invite', async () => {
    await handler(streamEvent(undefined, { ...appt, createdBy: 'pro', lastChangedBy: 'pro' }));
    const calls = ses.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(2);
    const own = rawOf(calls[1]);
    expect(toOf(own)).toBe('laura@correo.com');
    expect(parts(own).find((p) => p.headers.startsWith('Content-Type: text/html'))!.body).toContain('Agregamos esta cita a tu calendario');
    expect(calendarPart(own)!.body).toContain('METHOD:REQUEST');
    expect(emailMarkers()).toContain('EMAIL#appt1#invite#0');
  });

  it('client moves it: the pro notice carries a REQUEST with the new times and SEQUENCE = revision', async () => {
    const moved = { ...appt, start: '2026-10-22T16:00:00.000Z', end: '2026-10-22T16:30:00.000Z', revision: 1, updatedAt: '2026-10-20T02:00:00.000Z' };
    await handler(streamEvent(appt, moved));
    const proRaw = ses.commandCalls(SendEmailCommand).map(rawOf).find((r) => toOf(r) === 'laura@correo.com')!;
    const ics = calendarPart(proRaw)!.body;
    expect(ics).toContain('DTSTART:20261022T160000Z');
    expect(ics).toContain('SEQUENCE:1');
  });

  it('pro moves it: short "Actualizamos…" invite', async () => {
    const moved = { ...appt, start: '2026-10-22T16:00:00.000Z', end: '2026-10-22T16:30:00.000Z', revision: 1, lastChangedBy: 'pro' as const };
    await handler(streamEvent(appt, moved));
    const own = ses.commandCalls(SendEmailCommand).map(rawOf).find((r) => toOf(r) === 'laura@correo.com')!;
    expect(parts(own).find((p) => p.headers.startsWith('Content-Type: text/html'))!.body).toContain('Actualizamos esta cita en tu calendario');
  });

  it('client cancels: the pro email carries METHOD:CANCEL + STATUS:CANCELLED', async () => {
    await handler(streamEvent(appt, { ...appt, status: 'cancelled', cancelledBy: 'client', revision: 1, updatedAt: '2026-10-20T03:00:00.000Z' }));
    const calls = ses.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(1);
    const ics = calendarPart(rawOf(calls[0]))!.body;
    expect(rawOf(calls[0])).toContain('Content-Type: text/calendar; method=CANCEL; charset=UTF-8');
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('SEQUENCE:1');
  });

  it('pro cancels: client notice + short "Quitamos…" CANCEL invite to the pro', async () => {
    await handler(streamEvent(appt, { ...appt, status: 'cancelled', cancelledBy: 'pro', lastChangedBy: 'pro', revision: 1 }));
    const raws = ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input.Content!.Raw ? rawOf(c) : `To: ${c.args[0].input.Destination!.ToAddresses![0]}`);
    expect(raws.map(toOf).sort()).toEqual(['laura@correo.com', 'mariana@correo.com']);
    const own = raws.find((r) => toOf(r) === 'laura@correo.com')!;
    expect(parts(own).find((p) => p.headers.startsWith('Content-Type: text/html'))!.body).toContain('Quitamos esta cita de tu calendario');
    expect(calendarPart(own)!.body).toContain('METHOD:CANCEL');
  });

  it('invitesEnabled = false: no invite and no "own action" email', async () => {
    ddb.on(GetCommand, { Key: calSyncKey(PRO_ID) }).resolves({ Item: { token: 't', invitesEnabled: false } });
    await handler(streamEvent(undefined, appt));
    const calls = ses.commandCalls(SendEmailCommand);
    expect(calls).toHaveLength(2);
    expect(calls[1].args[0].input.Content!.Simple).toBeDefined(); // plain "Nueva cita", no invite
    ses.reset();
    ses.on(SendEmailCommand).resolves({});
    await handler(streamEvent(appt, { ...appt, status: 'cancelled', cancelledBy: 'pro', lastChangedBy: 'pro', revision: 1 }));
    expect(ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input.Destination?.ToAddresses?.[0])).toEqual(['mariana@correo.com']);
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
    expect(ddb.commandCalls(DeleteCommand).map((c) => c.args[0].input.Key!.PK)).toEqual(['EMAIL#appt1#client-confirmed#2026-10-20T00:00:00.000Z']);
  });

  it('does not email suppressed addresses', async () => {
    ddb.on(GetCommand, { Key: { PK: 'SUPPRESS#mariana@correo.com', SK: 'SUPPRESS' } }).resolves({ Item: { email: 'mariana@correo.com' } });
    ddb.on(GetCommand, { Key: calSyncKey(PRO_ID) }).resolves({ Item: { token: 't', invitesEnabled: false } });
    await handler(streamEvent(appt, { ...appt, status: 'cancelled', cancelledBy: 'pro', lastChangedBy: 'pro', updatedAt: '2026-10-20T01:00:00.000Z' }));
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  it('client booked with the phone only: no client email, the pro still gets "Nueva cita"', async () => {
    const phoneOnly: AppointmentItem = { ...appt, client: { ...appt.client, email: '' } };
    const res = await handler(streamEvent(undefined, phoneOnly));
    expect(res.batchItemFailures).toEqual([]);
    const raws = ses.commandCalls(SendEmailCommand).map(rawOf);
    expect(raws.map(toOf)).toEqual(['laura@correo.com']);
    expect(raws[0]).not.toContain('Reply-To: \r\n');
    expect(emailMarkers()).toEqual(['EMAIL#appt1#pro-new-booking#2026-10-20T00:00:00.000Z']);
    // Moves and cancellations by the pro email nobody but the pro's own calendar.
    ses.reset();
    ses.on(SendEmailCommand).resolves({ MessageId: 'm2' });
    await handler(streamEvent(phoneOnly, { ...phoneOnly, status: 'cancelled', cancelledBy: 'pro', lastChangedBy: 'pro', revision: 1 }));
    expect(ses.commandCalls(SendEmailCommand).map(rawOf).map(toOf)).toEqual(['laura@correo.com']);
  });

  describe('name-only appointment (pro-created, no email and no phone)', () => {
    const nameOnly: AppointmentItem = {
      ...appt, client: { name: 'Don Jorge', email: '', phone: '' }, clientKey: '', createdBy: 'pro', lastChangedBy: 'pro',
    };
    const clientPuts = () => ddb.commandCalls(PutCommand).filter((c) => String(c.args[0].input.Item!.SK).startsWith('CLIENT#'));

    it('create, move and cancel: no client email, no client record, no failures; the invite has no empty contact lines', async () => {
      const created = await handler(streamEvent(undefined, nameOnly));
      expect(created.batchItemFailures).toEqual([]);
      const moved = { ...nameOnly, start: '2026-10-22T16:00:00.000Z', end: '2026-10-22T16:30:00.000Z', revision: 1, updatedAt: '2026-10-20T01:00:00.000Z' };
      expect((await handler(streamEvent(nameOnly, moved))).batchItemFailures).toEqual([]);
      const cancelled = { ...moved, status: 'cancelled' as const, cancelledBy: 'pro' as const, revision: 2, updatedAt: '2026-10-20T02:00:00.000Z' };
      expect((await handler(streamEvent(moved, cancelled))).batchItemFailures).toEqual([]);

      const raws = ses.commandCalls(SendEmailCommand).map(rawOf);
      // Only the pro's own-action invitation carriers (added, updated, removed).
      expect(raws.map(toOf)).toEqual(['laura@correo.com', 'laura@correo.com', 'laura@correo.com']);
      const ics = calendarPart(raws[0])!.body;
      expect(ics).toContain('Don Jorge');
      expect(ics).not.toMatch(/Celular|Correo:/);
      expect(clientPuts()).toHaveLength(0);
    });

    it('a cancellation by the system emails the pro only, without an empty phone/email line', async () => {
      ddb.on(GetCommand, { Key: calSyncKey(PRO_ID) }).resolves({ Item: { token: 't', invitesEnabled: false } });
      const res = await handler(streamEvent(nameOnly, { ...nameOnly, status: 'cancelled', cancelledBy: 'system', lastChangedBy: 'system', revision: 1 }));
      expect(res.batchItemFailures).toEqual([]);
      const calls = ses.commandCalls(SendEmailCommand);
      expect(calls.map((c) => c.args[0].input.Destination?.ToAddresses?.[0])).toEqual(['laura@correo.com']);
      expect(calls[0].args[0].input.ReplyToAddresses ?? []).toEqual([]);
    });
  });
});
