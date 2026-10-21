import type { AppointmentItem } from '../appointments';
import { hasClientRecord, syncClientFromAppointment } from '../clients';

/**
 * Stream module: keeps `CLIENT#<clientKey>` in sync. Reads the appointment's
 * current state and recomputes the record's aggregates from its map, so
 * retries and replays (TRIM_HORIZON on a new event source) are no-ops.
 */
export async function clientsOnAppointment(after: AppointmentItem | undefined, now: Date): Promise<void> {
  if (!after || !hasClientRecord(after)) return;
  await syncClientFromAppointment(after.proId, after.id, now);
}
