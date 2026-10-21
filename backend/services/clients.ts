import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { ClientDetailResponse } from '../../shared/api';
import type { AppointmentOutcome, AppointmentStatus, ClientRecord, ISOInstant } from '../../shared/types';
import {
  batchGetAll, ddb, getItem, isConditionalFailure, queryAll, table, transactWrite, type Item,
} from '../lib/dynamo';
import { ApiError } from '../lib/http';
import { apptKey, CLIENT_PREFIX, clientRecordKey, proPk, settingsKey } from '../lib/keys';
import { log } from '../lib/logger';
import { appointmentItemsBetween, getAppointmentItem, toAppointment, type AppointmentItem } from './appointments';
import { deleteWaitlistEntriesOf } from './waitlist';

/**
 * Lightweight client history per professional (`PRO#<id> / CLIENT#<clientKey>`).
 *
 * The record keeps a bounded map of the client's appointments
 * (`appts: { [id]: { start, status, outcome?, createdAt } }`) and every
 * aggregate (totals, last/next, firstSeenAt) is RECOMPUTED from that map on
 * each event — never incremented — so stream retries and replays are
 * idempotent. The stream applies the CURRENT appointment item (fresh read),
 * not the event image, so an old replayed event can't resurrect stale data.
 * Optimistic concurrency with a `version` counter (notes edits bump it too).
 */

/** Appointments kept per client; older ones fold into `archived` totals. */
const MAX_REFS = 500;
/** Scrubbed appointments (client deleted) carry this key and never feed a record. */
export const DELETED_CLIENT_KEY = 'deleted';
const DELETED_NAME = 'Cliente eliminado';
const RETRIES = 4;

interface ApptRef {
  start: ISOInstant;
  status: AppointmentStatus;
  outcome?: AppointmentOutcome;
  createdAt: ISOInstant;
}

type Totals = ClientRecord['totals'];

export interface ClientItem extends ClientRecord {
  proId: string;
  appts: Record<string, ApptRef>;
  archived: Totals;
  /** createdAt of the appointment the stored contact came from (latest wins). */
  contactAt: ISOInstant;
  version: number;
}

const ZERO: Totals = { appointments: 0, attended: 0, noShows: 0, cancelled: 0 };

const refOf = (a: AppointmentItem): ApptRef => ({
  start: a.start, status: a.status, createdAt: a.createdAt, ...(a.outcome ? { outcome: a.outcome } : {}),
});

/** Totals + last/next from the refs (deterministic). */
export function aggregate(refs: ApptRef[], archived: Totals, now: Date): Pick<ClientRecord, 'totals' | 'lastAppointmentAt' | 'nextAppointmentAt'> {
  const totals = { ...archived };
  const t = now.toISOString();
  let last: string | null = null;
  let next: string | null = null;
  for (const r of refs) {
    if (r.status === 'cancelled') {
      totals.cancelled++;
      continue;
    }
    totals.appointments++;
    if (r.outcome === 'attended') totals.attended++;
    if (r.outcome === 'no_show') totals.noShows++;
    if (r.start < t) {
      if (!last || r.start > last) last = r.start;
    } else if (!next || r.start < next) {
      next = r.start;
    }
  }
  return { totals, lastAppointmentAt: last, nextAppointmentAt: next };
}

export function toClientRecord(item: ClientItem, now: Date = new Date()): ClientRecord {
  return {
    key: item.key,
    name: item.name,
    email: item.email,
    phone: item.phone,
    firstSeenAt: item.firstSeenAt,
    ...aggregate(Object.values(item.appts ?? {}), item.archived ?? ZERO, now),
    notes: item.notes ?? '',
    updatedAt: item.updatedAt,
  };
}

/** Pure merge of appointments into a record (or a new one). */
export function mergeAppointments(existing: ClientItem | undefined, proId: string, key: string, appts: AppointmentItem[], now: Date): ClientItem {
  const at = now.toISOString();
  const item: ClientItem = existing
    ? { ...existing, appts: { ...existing.appts }, archived: { ...(existing.archived ?? ZERO) } }
    : {
      proId, key, name: '', email: '', phone: '', firstSeenAt: appts[0]?.createdAt ?? at, lastAppointmentAt: null,
      nextAppointmentAt: null, totals: { ...ZERO }, notes: '', updatedAt: at, appts: {}, archived: { ...ZERO }, contactAt: '', version: 0,
    };
  for (const a of appts) {
    item.appts[a.id] = refOf(a);
    if (a.createdAt < item.firstSeenAt) item.firstSeenAt = a.createdAt;
    if (!item.contactAt || a.createdAt >= item.contactAt) {
      item.name = a.client.name;
      item.email = a.client.email;
      item.phone = a.client.phone;
      item.contactAt = a.createdAt;
    }
  }
  // Bound the map: fold the oldest into the archived totals.
  const ids = Object.keys(item.appts).sort((x, y) => item.appts[x].start.localeCompare(item.appts[y].start));
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_REFS))) {
    const r = item.appts[id];
    if (r.status === 'cancelled') item.archived.cancelled++;
    else {
      item.archived.appointments++;
      if (r.outcome === 'attended') item.archived.attended++;
      if (r.outcome === 'no_show') item.archived.noShows++;
    }
    delete item.appts[id];
  }
  Object.assign(item, aggregate(Object.values(item.appts), item.archived, now), { updatedAt: at });
  return item;
}

/** Applies appointments of one client to its record (optimistic concurrency, retried). */
export async function applyToClient(proId: string, key: string, appts: AppointmentItem[], now: Date = new Date()): Promise<ClientItem> {
  for (let attempt = 0; ; attempt++) {
    const existing = await getItem<ClientItem>(clientRecordKey(proId, key), true);
    const merged = mergeAppointments(existing, proId, key, appts, now);
    merged.version = (existing?.version ?? 0) + 1;
    try {
      await ddb.send(new PutCommand({
        TableName: table(),
        Item: { ...clientRecordKey(proId, key), ...merged },
        ConditionExpression: existing ? 'version = :v' : 'attribute_not_exists(PK)',
        ...(existing ? { ExpressionAttributeValues: { ':v': existing.version ?? 0 } } : {}),
      }));
      return merged;
    } catch (err) {
      if (isConditionalFailure(err) && attempt < RETRIES) continue;
      throw err;
    }
  }
}

/** Stream module: refresh the client record from the appointment's CURRENT state. */
export async function syncClientFromAppointment(proId: string, apptId: string, now: Date = new Date()): Promise<void> {
  const appt = await getAppointmentItem(proId, apptId, true);
  if (!appt || appt.clientKey === DELETED_CLIENT_KEY) return;
  await applyToClient(proId, appt.clientKey, [appt], now);
}

/** First visit to the clients page: build records from the whole appointment history (once). */
export async function ensureClientsBackfilled(proId: string, now: Date = new Date()): Promise<void> {
  const settings = await getItem<{ clientsBackfilledAt?: string }>(settingsKey(proId), true);
  if (settings?.clientsBackfilledAt) return;
  const all = await appointmentItemsBetween(proId, '0000', '9999');
  const groups = new Map<string, AppointmentItem[]>();
  for (const a of all) {
    if (a.clientKey === DELETED_CLIENT_KEY) continue;
    groups.set(a.clientKey, [...(groups.get(a.clientKey) ?? []), a]);
  }
  for (const [key, appts] of groups) await applyToClient(proId, key, appts, now);
  await ddb.send(new UpdateCommand({
    TableName: table(),
    Key: settingsKey(proId),
    UpdateExpression: 'SET clientsBackfilledAt = :at',
    ExpressionAttributeValues: { ':at': now.toISOString() },
  }));
  log.info('clients backfilled', { proId, clients: groups.size, appointments: all.length });
}

const normalizeText = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function matchesClient(c: Pick<ClientRecord, 'name' | 'email' | 'phone'>, q: string): boolean {
  const needle = normalizeText(q.trim());
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  return normalizeText(c.name).includes(needle) || c.email.toLowerCase().includes(needle) || (digits.length >= 3 && c.phone.includes(digits));
}

/** Most recent activity first (last appointment event or notes edit). */
export async function listClients(proId: string, q: string | undefined, now: Date = new Date()): Promise<ClientRecord[]> {
  await ensureClientsBackfilled(proId, now);
  const items = await queryAll<ClientItem>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': proPk(proId), ':p': CLIENT_PREFIX },
  }, 20_000);
  return items
    .map((i) => toClientRecord(i, now))
    .filter((c) => !q || matchesClient(c, q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function requireClientItem(proId: string, key: string): Promise<ClientItem> {
  const item = await getItem<ClientItem>(clientRecordKey(proId, key), true);
  if (!item) throw new ApiError('not_found', 'No encontramos ese cliente.');
  return item;
}

export async function clientDetail(proId: string, key: string, now: Date = new Date()): Promise<ClientDetailResponse> {
  const item = await requireClientItem(proId, key);
  const appts = await batchGetAll<Item>(Object.keys(item.appts ?? {}).map((id) => apptKey(proId, id)));
  return {
    client: toClientRecord(item, now),
    appointments: appts.map(toAppointment).sort((a, b) => b.start.localeCompare(a.start)),
  };
}

export async function updateClientNotes(proId: string, key: string, notes: string, now: Date = new Date()): Promise<ClientRecord> {
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: clientRecordKey(proId, key),
      UpdateExpression: 'SET notes = :n, updatedAt = :u, version = if_not_exists(version, :zero) + :one',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':n': notes, ':u': now.toISOString(), ':zero': 0, ':one': 1 },
      ReturnValues: 'ALL_NEW',
    }));
    return toClientRecord(res.Attributes as ClientItem, now);
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('not_found', 'No encontramos ese cliente.');
    throw err;
  }
}

/**
 * Right to deletion (Ley 1581): refused while the client has upcoming
 * confirmed appointments; otherwise scrubs name/email/phone (and the
 * cancellation reason) from that pro's appointments of this client, removes
 * their waitlist entries and finally the record itself.
 */
export async function deleteClient(proId: string, key: string, now: Date = new Date()): Promise<void> {
  await requireClientItem(proId, key);
  const appts = (await appointmentItemsBetween(proId, '0000', '9999')).filter((a) => a.clientKey === key);
  if (appts.some((a) => a.status === 'confirmed' && a.start > now.toISOString())) {
    throw new ApiError('conflict', 'Tiene citas próximas. Cancélalas antes de borrar sus datos.');
  }
  for (const a of appts) {
    await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: apptKey(proId, a.id),
      UpdateExpression: 'SET client = :c, clientKey = :k REMOVE cancelReason',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':c': { name: DELETED_NAME, email: '', phone: '' }, ':k': DELETED_CLIENT_KEY },
    })).catch((err) => {
      if (!isConditionalFailure(err)) throw err;
    });
  }
  await deleteWaitlistEntriesOf(proId, key);
  await transactWrite([{ Delete: { TableName: table(), Key: clientRecordKey(proId, key) } }]);
  log.info('client deleted', { proId, appointments: appts.length });
}
