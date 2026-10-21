import type { DynamoDBStreamEvent } from 'aws-lambda';
import { APPT_PREFIX } from '../../lib/keys';
import { images, recordSk, runBatch } from '../../lib/streams';
import type { AppointmentItem } from '../../services/appointments';
import { processAppointmentChange } from '../../services/appointment-emails';

/**
 * DynamoDB stream (filtered to APPT# items; NEW_AND_OLD_IMAGES): appointment
 * emails — confirmation, change, cancellation and the pro's notices.
 * Idempotent per (appointment, kind, updatedAt); partial failures are
 * reported so only the failed tail of the batch is retried.
 */
export const handler = async (event: DynamoDBStreamEvent) =>
  runBatch(event.Records, async (record) => {
    if (!recordSk(record).startsWith(APPT_PREFIX)) return;
    const { oldItem, newItem } = images(record);
    await processAppointmentChange(oldItem as AppointmentItem | undefined, newItem as AppointmentItem | undefined);
  });
