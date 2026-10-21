import {
  BatchGetCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { clientKeyOf } from '../../shared/clients';
import { apptKey, clientRecordKey, settingsKey } from '../lib/keys';
import { conditionalFailure, PRO_ID, setTestEnv } from '../testing/fixtures';
import type { AppointmentItem } from './appointments';
import {
  aggregate, applyToClient, clientDetail, CLIENTS_BACKFILL_VERSION, deleteClient, listClients, mergeAppointments, syncClientFromAppointment,
  type ClientItem,
} from './clients';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const NOW = new Date('2026-10-21T15:00:00.000Z');
const KEY = clientKeyOf({ email: '', phone: '3001234567' });

const appt = (id: string, start: string, extra: Partial<AppointmentItem> = {}): AppointmentItem => ({
  id, proId: PRO_ID, serviceId: 's', serviceName: 'Valoración', durationMin: 30, priceCop: 60000, start, end: start, status: 'confirmed',
  client: { name: 'Mariana Gómez', email: 'mariana@correo.com', phone: '3001234567' }, createdBy: 'client',
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', lockBufferMin: 10, clientConfirmation: 'pending',
  revision: 0, clientKey: KEY, ...extra,
});

const history = [
  appt('a1', '2026-09-10T15:00:00.000Z', { outcome: 'attended' }),
  appt('a2', '2026-09-20T15:00:00.000Z', { outcome: 'no_show', createdAt: '2026-09-15T00:00:00.000Z', client: { name: 'Mariana G.', email: 'mariana.g@correo.com', phone: '3001234567' } }),
  appt('a3', '2026-10-01T15:00:00.000Z', { status: 'cancelled' }),
  appt('a4', '2026-11-05T15:00:00.000Z'),
];

beforeEach(() => {
  ddb.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(PutCommand).resolves({});
  ddb.on(UpdateCommand).resolves({});
  ddb.on(DeleteCommand).resolves({});
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(TransactWriteCommand).resolves({});
});

describe('aggregates', () => {
  it('derives totals, last and next from the appointment map', () => {
    const item = mergeAppointments(undefined, PRO_ID, KEY, history, NOW);
    expect(item.totals).toEqual({ appointments: 3, attended: 1, noShows: 1, cancelled: 1 });
    expect(item.lastAppointmentAt).toBe('2026-09-20T15:00:00.000Z');
    expect(item.nextAppointmentAt).toBe('2026-11-05T15:00:00.000Z');
    expect(item.firstSeenAt).toBe('2026-09-01T00:00:00.000Z');
    // Latest booking's contact wins.
    expect(item).toMatchObject({ name: 'Mariana G.', email: 'mariana.g@correo.com' });
  });

  it('is idempotent: re-applying the same events changes nothing', () => {
    const once = mergeAppointments(undefined, PRO_ID, KEY, history, NOW);
    const twice = mergeAppointments(once, PRO_ID, KEY, history, NOW);
    expect(twice.totals).toEqual(once.totals);
    expect(Object.keys(twice.appts)).toHaveLength(4);
  });

  it('status/outcome changes move the counts (no blind increments)', () => {
    const base = mergeAppointments(undefined, PRO_ID, KEY, history, NOW);
    const after = mergeAppointments(base, PRO_ID, KEY, [appt('a4', '2026-11-05T15:00:00.000Z', { status: 'cancelled' })], NOW);
    expect(after.totals).toEqual({ appointments: 2, attended: 1, noShows: 1, cancelled: 2 });
    expect(after.nextAppointmentAt).toBeNull();
  });

  it('last/next are recomputed against the current time', () => {
    const refs = [{ start: '2026-10-22T15:00:00.000Z', status: 'confirmed' as const, createdAt: '' }];
    expect(aggregate(refs, { appointments: 0, attended: 0, noShows: 0, cancelled: 0 }, NOW).nextAppointmentAt).toBe('2026-10-22T15:00:00.000Z');
    expect(aggregate(refs, { appointments: 0, attended: 0, noShows: 0, cancelled: 0 }, new Date('2026-10-23T00:00:00Z')).lastAppointmentAt).toBe('2026-10-22T15:00:00.000Z');
  });
});

describe('applyToClient / stream sync', () => {
  it('creates with attribute_not_exists, updates with the version condition, and retries on conflicts', async () => {
    await applyToClient(PRO_ID, KEY, [history[0]], NOW);
    expect(ddb.commandCalls(PutCommand)[0].args[0].input.ConditionExpression).toBe('attribute_not_exists(PK)');

    ddb.reset();
    const existing = { ...mergeAppointments(undefined, PRO_ID, KEY, [history[0]], NOW), version: 3, notes: 'Prefiere la mañana' };
    ddb.on(GetCommand, { Key: clientRecordKey(PRO_ID, KEY) }).resolves({ Item: existing });
    ddb.on(PutCommand).rejectsOnce(conditionalFailure()).resolves({});
    const merged = await applyToClient(PRO_ID, KEY, [history[1]], NOW);
    expect(ddb.commandCalls(PutCommand)).toHaveLength(2);
    expect(ddb.commandCalls(PutCommand)[1].args[0].input.ExpressionAttributeValues).toEqual({ ':v': 3 });
    expect(merged.notes).toBe('Prefiere la mañana');
    expect(merged.version).toBe(4);
  });

  it('uses the CURRENT appointment, and skips scrubbed (deleted-client) ones', async () => {
    ddb.on(GetCommand, { Key: apptKey(PRO_ID, 'a1') }).resolves({ Item: { ...history[0], clientKey: 'deleted' } });
    await syncClientFromAppointment(PRO_ID, 'a1', NOW);
    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });
});

describe('listClients', () => {
  it('backfills once from the LSI, flags SETTINGS, then lists most recent first with a text filter', async () => {
    ddb.on(QueryCommand, { IndexName: 'lsi1-start' }).resolves({ Items: history });
    const records: ClientItem[] = [
      { ...mergeAppointments(undefined, PRO_ID, KEY, history, NOW), updatedAt: '2026-10-20T00:00:00.000Z' },
      { ...mergeAppointments(undefined, PRO_ID, clientKeyOf({ email: '', phone: '3105550000' }), [appt('b1', '2026-10-02T15:00:00.000Z', { clientKey: clientKeyOf({ email: '', phone: '3105550000' }), client: { name: 'Óscar Ruiz', email: '', phone: '3105550000' } })], NOW), updatedAt: '2026-10-21T00:00:00.000Z' },
    ];
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': `PRO#${PRO_ID}`, ':p': 'CLIENT#' } }).resolves({ Items: records });

    const all = await listClients(PRO_ID, undefined, NOW);
    expect(ddb.commandCalls(PutCommand)).toHaveLength(1); // one client in the history → one record
    const flag = ddb.commandCalls(UpdateCommand).find((c) => c.args[0].input.Key!.SK === settingsKey(PRO_ID).SK)!;
    expect(flag.args[0].input.UpdateExpression).toBe('SET clientsBackfilledAt = :at, clientsBackfillVersion = :v');
    expect(flag.args[0].input.ExpressionAttributeValues).toMatchObject({ ':v': CLIENTS_BACKFILL_VERSION });
    expect(all.map((c) => c.name)).toEqual(['Óscar Ruiz', 'Mariana G.']);
    expect((all[0] as unknown as Record<string, unknown>).appts).toBeUndefined();

    expect((await listClients(PRO_ID, 'oscar', NOW)).map((c) => c.name)).toEqual(['Óscar Ruiz']);
    expect((await listClients(PRO_ID, '310 555', NOW)).map((c) => c.name)).toEqual(['Óscar Ruiz']);
  });

  it('skips the backfill when SETTINGS is flagged with the current version', async () => {
    ddb.on(GetCommand, { Key: settingsKey(PRO_ID) })
      .resolves({ Item: { clientsBackfilledAt: '2026-10-01T00:00:00.000Z', clientsBackfillVersion: CLIENTS_BACKFILL_VERSION } });
    await listClients(PRO_ID, undefined, NOW);
    expect(ddb.commandCalls(QueryCommand).some((c) => c.args[0].input.IndexName)).toBe(false);
  });
});

describe('re-keying backfill (v1 email-first keys → phone-first)', () => {
  it('re-keys appointments and waitlist entries, rebuilds the record, carries notes over and drops the old record', async () => {
    const oldKey = clientKeyOf({ email: 'mariana@correo.com', phone: '' });
    ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: { clientsBackfilledAt: '2026-10-01T00:00:00.000Z' } });
    ddb.on(QueryCommand, { IndexName: 'lsi1-start' }).resolves({ Items: history.map((a) => ({ ...a, clientKey: oldKey })) });
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': `PRO#${PRO_ID}`, ':p': 'WAIT#' } })
      .resolves({ Items: [{ id: 'w1', clientKey: oldKey, client: { name: 'Mariana', email: 'mariana@correo.com', phone: '3001234567' } }] });
    const oldRecord = { ...mergeAppointments(undefined, PRO_ID, oldKey, history, NOW), notes: 'Prefiere la mañana' };
    const newRecord = mergeAppointments(undefined, PRO_ID, KEY, history, NOW);
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': `PRO#${PRO_ID}`, ':p': 'CLIENT#' } }).resolves({ Items: [oldRecord, newRecord] });

    await listClients(PRO_ID, undefined, NOW);

    const updates = ddb.commandCalls(UpdateCommand).map((c) => c.args[0].input);
    expect(updates.filter((u) => String(u.Key!.SK).startsWith('APPT#')).map((u) => u.ExpressionAttributeValues![':k'])).toEqual([KEY, KEY, KEY, KEY]);
    expect(updates.find((u) => u.Key!.SK === 'WAIT#w1')!.ExpressionAttributeValues![':k']).toBe(KEY);
    expect(ddb.commandCalls(PutCommand).map((c) => c.args[0].input.Item!.SK)).toEqual([`CLIENT#${KEY}`]);
    const notes = updates.find((u) => u.Key!.SK === `CLIENT#${KEY}`)!;
    expect(notes.ExpressionAttributeValues![':n']).toBe('Prefiere la mañana');
    expect(ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Delete!.Key).toEqual(clientRecordKey(PRO_ID, oldKey));
  });
});

describe('detail and deletion', () => {
  beforeEach(() => {
    ddb.on(GetCommand, { Key: clientRecordKey(PRO_ID, KEY) }).resolves({ Item: mergeAppointments(undefined, PRO_ID, KEY, history, NOW) });
  });

  it('detail returns the record and its appointments newest first (BatchGet)', async () => {
    ddb.on(BatchGetCommand).resolves({ Responses: { 'separame-test': history } });
    const res = await clientDetail(PRO_ID, KEY, NOW);
    expect(res.appointments.map((a) => a.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
    expect(res.client.totals.appointments).toBe(3);
  });

  it('refuses while there are upcoming confirmed appointments', async () => {
    ddb.on(QueryCommand, { IndexName: 'lsi1-start' }).resolves({ Items: history });
    await expect(deleteClient(PRO_ID, KEY, NOW)).rejects.toMatchObject({ code: 'conflict', message: expect.stringContaining('Tiene citas próximas') });
  });

  it('scrubs personal data from past appointments, drops waitlist entries and the record', async () => {
    ddb.on(QueryCommand, { IndexName: 'lsi1-start' }).resolves({ Items: history.slice(0, 3) });
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': `PRO#${PRO_ID}`, ':p': 'WAIT#' } }).resolves({ Items: [{ id: 'w1', clientKey: KEY }, { id: 'w2', clientKey: 'other' }] });
    await deleteClient(PRO_ID, KEY, NOW);
    const scrubs = ddb.commandCalls(UpdateCommand).map((c) => c.args[0].input);
    expect(scrubs).toHaveLength(3);
    expect(scrubs[0].ExpressionAttributeValues).toEqual({ ':c': { name: 'Cliente eliminado', email: '', phone: '' }, ':k': 'deleted' });
    expect(scrubs[0].UpdateExpression).toContain('REMOVE cancelReason');
    expect(ddb.commandCalls(DeleteCommand).map((c) => c.args[0].input.Key!.SK)).toEqual(['WAIT#w1']);
    expect(ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Delete!.Key).toEqual(clientRecordKey(PRO_ID, KEY));
  });
});
