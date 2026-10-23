import { randomBytes } from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CALENDAR_FEED_FUTURE_DAYS, CALENDAR_FEED_PAST_DAYS, type CalendarSyncResponse } from '../../shared/api';
import { ROOT_DOMAIN } from '../../shared/infra';
import { addDays, toInstant, todayBogota, type ISOInstant } from '../../shared/time';
import type { ProProfile } from '../../shared/types';
import { ddb, failedConditionIndex, getItem, table, transactWrite } from '../lib/dynamo';
import { env } from '../lib/env';
import { ApiError } from '../lib/http';
import { calFeedKey, calSyncKey } from '../lib/keys';
import { ownerIdOf } from './subscriptions';
import { log } from '../lib/logger';
import { buildCalendar, type IcsEvent, type IcsMethod } from '../mail/ics';
import { whereText } from '../mail/templates/common';
import { appointmentItemsBetween, revisionOf, type AppointmentItem } from './appointments';

/**
 * Calendar sync for the professional, without OAuth:
 *  1. A secret subscription feed (`/public/calendar/<token>.ics`) that
 *     Google / Outlook / Apple poll. Rotating the token kills the old URL.
 *  2. Calendar invitations (REQUEST / CANCEL) emailed on every change by
 *     stream-appointments, when `invitesEnabled` (default true).
 * Both use the same UID per appointment and its `revision` as SEQUENCE.
 */

const DAY_MS = 86_400_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,}$/;
export const FEED_FILE_RE = /^([A-Za-z0-9_-]{32,})\.ics$/;

export interface CalSyncItem {
  token: string;
  invitesEnabled: boolean;
  createdAt: ISOInstant;
}

export const newFeedToken = (): string => randomBytes(32).toString('base64url');

export function syncResponse(item: CalSyncItem): CalendarSyncResponse {
  const feedUrl = `${env.apiUrl()}/public/calendar/${item.token}.ics`;
  const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');
  return {
    feedUrl,
    webcalUrl,
    googleUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`,
    outlookUrl: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('Sepárame')}`,
    invitesEnabled: item.invitesEnabled,
    createdAt: item.createdAt,
  };
}

export async function getSync(proId: string, consistent = false): Promise<CalSyncItem | undefined> {
  return getItem<CalSyncItem>(calSyncKey(proId), consistent);
}

/** Settings, created on first read (token + feed lookup in one transaction). */
export async function getOrCreateSync(proId: string, now: Date = new Date()): Promise<CalSyncItem> {
  const existing = await getSync(proId, true);
  if (existing) return existing;
  const item: CalSyncItem = { token: newFeedToken(), invitesEnabled: true, createdAt: now.toISOString() };
  try {
    await transactWrite([
      { Put: { TableName: table(), Item: { ...calSyncKey(proId), proId, ...item }, ConditionExpression: 'attribute_not_exists(PK)' } },
      { Put: { TableName: table(), Item: { ...calFeedKey(item.token), proId, createdAt: item.createdAt }, ConditionExpression: 'attribute_not_exists(PK)' } },
    ]);
  } catch (err) {
    // A concurrent first call created it: use that one.
    if (failedConditionIndex(err) === 0) {
      const created = await getSync(proId, true);
      if (created) return created;
    }
    throw err;
  }
  log.info('calendar sync created', { proId });
  return item;
}

export async function setInvitesEnabled(proId: string, enabled: boolean, now: Date = new Date()): Promise<CalSyncItem> {
  await getOrCreateSync(proId, now);
  const res = await ddb.send(new UpdateCommand({
    TableName: table(),
    Key: calSyncKey(proId),
    UpdateExpression: 'SET invitesEnabled = :e',
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeValues: { ':e': enabled },
    ReturnValues: 'ALL_NEW',
  }));
  return res.Attributes as CalSyncItem;
}

/** New secret URL; the old one stops working immediately (same transaction). */
export async function rotateFeedToken(proId: string, now: Date = new Date()): Promise<CalSyncItem> {
  const current = await getOrCreateSync(proId, now);
  const token = newFeedToken();
  try {
    await transactWrite([
      { Put: { TableName: table(), Item: { ...calFeedKey(token), proId, createdAt: now.toISOString() }, ConditionExpression: 'attribute_not_exists(PK)' } },
      { Delete: { TableName: table(), Key: calFeedKey(current.token) } },
      {
        Update: {
          TableName: table(),
          Key: calSyncKey(proId),
          UpdateExpression: 'SET #t = :new',
          ConditionExpression: '#t = :old',
          ExpressionAttributeNames: { '#t': 'token' },
          ExpressionAttributeValues: { ':new': token, ':old': current.token },
        },
      },
    ]);
  } catch (err) {
    if (failedConditionIndex(err) === 2) throw new ApiError('conflict', 'El enlace cambió mientras tanto. Recarga e intenta de nuevo.');
    throw err;
  }
  log.info('calendar feed rotated', { proId });
  return { ...current, token };
}

/** Invitations are on unless the pro turned them off (no CALSYNC item yet → on). */
export async function invitesEnabledFor(proId: string): Promise<boolean> {
  // A team member's invitations go to the owner's email: the owner's setting decides.
  const item = await getSync((await ownerIdOf(proId)) ?? proId);
  return item ? item.invitesEnabled !== false : true;
}

/** `<token>.ics` → proId, or 404 (malformed or unknown/rotated token). */
export async function resolveFeed(file: string): Promise<string> {
  const match = FEED_FILE_RE.exec(file);
  if (!match || !TOKEN_RE.test(match[1])) throw new ApiError('not_found');
  const item = await getItem<{ proId: string }>(calFeedKey(match[1]));
  if (!item?.proId) throw new ApiError('not_found');
  return item.proId;
}

// ── Events ─────────────────────────────────────────────────────────────────

const formatPhone = (phone: string) => (/^\d{10}$/.test(phone) ? `+57 ${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone ? `+57 ${phone}` : '');

const BOOKED_BY: Record<string, string> = {
  client: 'Reservada por el cliente en tu página de Sepárame',
  pro: 'Agendada por ti desde el panel',
  admin: 'Agendada por el equipo de Sepárame',
  system: 'Agendada por Sepárame',
};

/** The pro's view of an appointment as a calendar event (feed and invitations). */
export function proEvent(appt: AppointmentItem, pro: ProProfile, now: Date = new Date()): IcsEvent {
  const description = [
    `Cliente: ${appt.client.name}`,
    appt.client.phone ? `Celular: ${formatPhone(appt.client.phone)}` : '',
    appt.client.email ? `Correo: ${appt.client.email}` : '',
    BOOKED_BY[appt.createdBy] ?? BOOKED_BY.system,
    `Ver en Sepárame: ${env.siteUrl()}/app/appointments`,
  ].filter(Boolean).join('\n');
  return {
    uid: `${appt.id}@${ROOT_DOMAIN}`,
    start: appt.start,
    end: appt.end,
    summary: `${appt.serviceName} · ${appt.client.name}`,
    description,
    location: whereText(pro),
    sequence: revisionOf(appt),
    status: appt.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED',
    stamp: now,
  };
}

/** `noreply@<domain of MAIL_FROM>` — the invitation's ORGANIZER. */
export function organizerEmail(): string {
  const from = env.mailFrom();
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const domain = address.split('@')[1]?.trim() || ROOT_DOMAIN;
  return `noreply@${domain}`;
}

/** Invitation calendar (REQUEST for new/moved, CANCEL for cancelled). */
export function buildInvite(appt: AppointmentItem, pro: ProProfile, method: Exclude<IcsMethod, 'PUBLISH'>, now: Date = new Date()): string {
  const event: IcsEvent = {
    ...proEvent(appt, pro, now),
    ...(method === 'CANCEL' ? { status: 'CANCELLED' as const } : {}),
    organizer: { name: 'Sepárame', email: organizerEmail() },
    attendees: [{ name: pro.name, email: pro.email }],
  };
  return buildCalendar({ method, prodId: '-//Sepárame//Agenda//ES', events: [event] });
}

/**
 * The subscription feed: confirmed appointments in [today − 30 d, today + 365 d]
 * plus ones cancelled in the last 30 days (STATUS:CANCELLED, so subscribed
 * calendars remove them).
 */
export async function buildFeed(pro: ProProfile, now: Date = new Date()): Promise<string> {
  const today = todayBogota(now);
  const from = toInstant(addDays(today, -CALENDAR_FEED_PAST_DAYS), '00:00');
  const to = toInstant(addDays(today, CALENDAR_FEED_FUTURE_DAYS + 1), '00:00');
  const cancelledSince = new Date(now.getTime() - CALENDAR_FEED_PAST_DAYS * DAY_MS).toISOString();
  const items = await appointmentItemsBetween(pro.id, from, to, 10_000);
  const events = items
    .filter((a) => (a.status === 'confirmed' || (a.status === 'cancelled' && a.updatedAt >= cancelledSince)))
    .map((a) => proEvent(a, pro, now));
  return buildCalendar({
    method: 'PUBLISH',
    prodId: '-//Sepárame//Agenda//ES',
    headers: [
      `X-WR-CALNAME:Sepárame · ${pro.name.replace(/[\r\n]/g, ' ')}`,
      'X-WR-TIMEZONE:America/Bogota',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
    ],
    events,
  });
}

