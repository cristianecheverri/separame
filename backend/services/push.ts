import { DeleteCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { sendNotification, WebPushError } from 'web-push';
import type { PushConfigResponse, PushSubscriptionRequest } from '../../shared/api';
import { SSM_PARAMS } from '../../shared/infra';
import type { ISOInstant } from '../../shared/time';
import { ddb, queryAll, table } from '../lib/dynamo';
import { env } from '../lib/env';
import { log } from '../lib/logger';
import { proPk, PUSH_PREFIX, pushKey } from '../lib/keys';
import { getOptionalParam } from '../lib/ssm';
import { sha256Hex } from '../lib/tokens';

/**
 * Web push to the professional's devices (PWA). Subscriptions live in
 * `PRO#<id> / PUSH#<sha256(endpoint)>` (max 10 per pro, oldest dropped).
 * VAPID keys come from SSM; when they are missing the feature is simply off
 * (logged once). Delivery is best-effort: a failing device never fails the
 * caller, and 404/410 (expired subscription) deletes it.
 */

export const MAX_DEVICES = 10;
const PUSH_TTL_SECONDS = 24 * 60 * 60;

export interface PushItem {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceLabel: string;
  createdAt: ISOInstant;
  lastSuccessAt: ISOInstant | null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path inside the site, e.g. "/app/". */
  url: string;
  /** Replaces an earlier notification with the same tag (e.g. the appointment id). */
  tag: string;
}

export const endpointHash = (endpoint: string) => sha256Hex(endpoint);

let missingLogged = false;

/** VAPID keys, or null when push isn't configured for this stage. */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  const [publicKey, privateKey] = await Promise.all([
    getOptionalParam(SSM_PARAMS.webPushPublicKey),
    getOptionalParam(SSM_PARAMS.webPushPrivateKey),
  ]);
  if (publicKey && privateKey) return { publicKey, privateKey };
  if (!missingLogged) {
    log.warn('web push disabled: VAPID keys missing in SSM');
    missingLogged = true;
  }
  return null;
}

/** `mailto:noreply@<mail domain>` — the VAPID subject push services can contact. */
export function vapidSubject(): string {
  const from = env.mailFrom();
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  return `mailto:noreply@${address.split('@')[1]?.trim() || 'separame.app'}`;
}

export async function listDevices(proId: string): Promise<PushItem[]> {
  return queryAll<PushItem>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)',
    ExpressionAttributeValues: { ':pk': proPk(proId), ':p': PUSH_PREFIX },
    ConsistentRead: true,
  });
}

export async function pushConfig(proId: string): Promise<PushConfigResponse> {
  const [keys, devices] = await Promise.all([vapidKeys(), listDevices(proId)]);
  return {
    vapidPublicKey: keys?.publicKey ?? null,
    devices: devices
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((d) => ({ endpointHash: endpointHash(d.endpoint), deviceLabel: d.deviceLabel, createdAt: d.createdAt, lastSuccessAt: d.lastSuccessAt ?? null })),
  };
}

/** Upsert a device; beyond MAX_DEVICES the oldest ones are dropped. */
export async function subscribe(proId: string, input: PushSubscriptionRequest, now: Date = new Date()): Promise<void> {
  const hash = endpointHash(input.endpoint);
  const others = (await listDevices(proId)).filter((d) => endpointHash(d.endpoint) !== hash)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const old of others.slice(0, Math.max(0, others.length - (MAX_DEVICES - 1)))) {
    await ddb.send(new DeleteCommand({ TableName: table(), Key: pushKey(proId, endpointHash(old.endpoint)) }));
  }
  const item: PushItem = {
    endpoint: input.endpoint, keys: input.keys, deviceLabel: input.deviceLabel || 'Dispositivo', createdAt: now.toISOString(), lastSuccessAt: null,
  };
  await ddb.send(new PutCommand({ TableName: table(), Item: { ...pushKey(proId, hash), proId, ...item } }));
}

export async function unsubscribe(proId: string, endpoint: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: table(), Key: pushKey(proId, endpointHash(endpoint)) }));
}

/** Sends to every device of the pro. Returns how many deliveries succeeded. */
export async function pushToPro(proId: string, payload: PushPayload, now: Date = new Date()): Promise<number> {
  const keys = await vapidKeys();
  if (!keys) return 0;
  const devices = await listDevices(proId);
  let delivered = 0;
  for (const device of devices) {
    const hash = endpointHash(device.endpoint);
    try {
      await sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify(payload), {
        TTL: PUSH_TTL_SECONDS,
        vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
      });
      delivered++;
      await ddb.send(new UpdateCommand({
        TableName: table(), Key: pushKey(proId, hash), UpdateExpression: 'SET lastSuccessAt = :at',
        ConditionExpression: 'attribute_exists(PK)', ExpressionAttributeValues: { ':at': now.toISOString() },
      })).catch(() => undefined);
    } catch (err) {
      const status = err instanceof WebPushError ? err.statusCode : (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await ddb.send(new DeleteCommand({ TableName: table(), Key: pushKey(proId, hash) }));
        log.info('push subscription expired; removed', { proId });
      } else {
        log.warn('push delivery failed', { proId, status, err });
      }
    }
  }
  return delivered;
}
