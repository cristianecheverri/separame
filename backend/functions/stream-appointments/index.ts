import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { APPT_PREFIX, WAIT_PREFIX } from '../../lib/keys';
import { log } from '../../lib/logger';
import { images, recordSk, runBatch } from '../../lib/streams';
import { normalizeAppointment } from '../../services/appointments';
import { clientsOnAppointment } from '../../services/stream/clients';
import { processAppointmentChange } from '../../services/stream/emails';
import { pushOnAppointment, pushOnWaitlistJoin } from '../../services/stream/push';
import { waitlistOnAppointment, waitlistOnJoin } from '../../services/stream/waitlist';
import type { WaitItem } from '../../services/waitlist';

/**
 * DynamoDB stream (APPT# and WAIT# items; NEW_AND_OLD_IMAGES) → independent
 * modules: emails (+ calendar invites), client history, waitlist, web push.
 *
 * Every module runs even if another fails, and each one is idempotent on its
 * own (EMAIL#/push markers, deterministic client recompute, per-offer
 * markers). If any module fails, the record is reported in
 * `batchItemFailures` and retried; modules that already succeeded are no-ops
 * on the retry. The same holds for replays (TRIM_HORIZON).
 */

type Module = [name: string, run: () => Promise<unknown>];

async function runModules(record: DynamoDBRecord, modules: Module[]): Promise<void> {
  const failed: string[] = [];
  for (const [name, run] of modules) {
    try {
      await run();
    } catch (err) {
      failed.push(name);
      log.error('stream module failed', { module: name, eventId: record.eventID, err });
    }
  }
  if (failed.length) throw new Error(`stream modules failed: ${failed.join(', ')}`);
}

const eventTime = (record: DynamoDBRecord, now: Date): Date => {
  const seconds = record.dynamodb?.ApproximateCreationDateTime;
  return typeof seconds === 'number' ? new Date(seconds * 1000) : now;
};

export const handler = async (event: DynamoDBStreamEvent) =>
  runBatch(event.Records, async (record) => {
    const sk = recordSk(record);
    const now = new Date();
    const eventAt = eventTime(record, now);
    const { oldItem, newItem } = images(record);

    if (sk.startsWith(APPT_PREFIX)) {
      const before = oldItem ? normalizeAppointment(oldItem) : undefined;
      const after = newItem ? normalizeAppointment(newItem) : undefined;
      await runModules(record, [
        ['emails', () => processAppointmentChange(before, after, now)],
        ['clients', () => clientsOnAppointment(after, now)],
        ['waitlist', () => waitlistOnAppointment(before, after, now)],
        ['push', () => pushOnAppointment(before, after, eventAt, now)],
      ]);
      return;
    }

    if (sk.startsWith(WAIT_PREFIX) && record.eventName === 'INSERT' && newItem) {
      const entry = newItem as WaitItem;
      await runModules(record, [
        ['waitlist', () => waitlistOnJoin(entry, now)],
        ['push', () => pushOnWaitlistJoin(entry, eventAt, now)],
      ]);
    }
  });

