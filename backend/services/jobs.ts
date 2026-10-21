import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GSI2 } from '../../shared/infra';
import { GRACE_DAYS, RENEWAL_NOTICE_DAYS } from '../../shared/subscription';
import { addDays, todayBogota } from '../../shared/time';
import type { ProProfile } from '../../shared/types';
import { ddb, isConditionalFailure, queryAll, table } from '../lib/dynamo';
import { remindPkForDate, subKey } from '../lib/keys';
import { log } from '../lib/logger';
import { sendRenewalNotice, sendReminder } from '../mail/notifications';
import { sendOnce } from '../mail/sender';
import { getAppointmentItem, markReminderSent, toAppointment } from './appointments';
import { getProfile } from './profiles';
import { listSubItemsByGrace, subscriptionStatus } from './subscriptions';

/**
 * Work of the single recurring job (every 10 minutes): due 24 h reminders
 * from the sparse GSI2 buckets and renewal notices. Each step is bounded
 * per run; leftovers are picked up by the next tick.
 */

const DAY_MS = 86_400_000;

/** Parses `<remindAtISO>#<proId>#<apptId>`. */
export function parseRemindSk(sk: string): { proId: string; apptId: string } | null {
  const parts = sk.split('#');
  if (parts.length !== 3) return null;
  return { proId: parts[1], apptId: parts[2] };
}

export async function sendDueReminders(now: Date, budget: number): Promise<number> {
  const today = todayBogota(now);
  const profiles = new Map<string, ProProfile | undefined>();
  let processed = 0;
  for (const date of [addDays(today, -1), today]) {
    if (processed >= budget) break;
    const due = await queryAll({
      IndexName: GSI2.name,
      KeyConditionExpression: '#pk = :pk AND #sk <= :now',
      ExpressionAttributeNames: { '#pk': GSI2.pk, '#sk': GSI2.sk },
      ExpressionAttributeValues: { ':pk': remindPkForDate(date), ':now': `${now.toISOString()}#~` },
      ProjectionExpression: '#sk',
    }, budget - processed);

    for (const row of due) {
      const ids = parseRemindSk(String(row[GSI2.sk]));
      if (!ids) continue;
      processed++;
      const appt = await getAppointmentItem(ids.proId, ids.apptId, true);
      if (!appt) continue;
      // Cancelled/past appointments: just drop the pending marker.
      if (appt.status === 'confirmed' && new Date(appt.start).getTime() > now.getTime() && appt.client.email) {
        if (!profiles.has(ids.proId)) profiles.set(ids.proId, await getProfile(ids.proId));
        const pro = profiles.get(ids.proId);
        if (pro) {
          try {
            await sendOnce(`${appt.id}#reminder#${appt.start}`, () => sendReminder(toAppointment(appt), pro), now);
          } catch (err) {
            log.error('reminder failed', { proId: ids.proId, appointmentId: ids.apptId, err });
            continue; // keep it pending → retried next tick
          }
        }
      }
      await markReminderSent(ids.proId, ids.apptId, now);
    }
  }
  return processed;
}

export async function sendRenewalNotices(now: Date, budget: number): Promise<number> {
  // accessUntil ∈ (now, now + NOTICE] ⇔ graceUntil ∈ (now + GRACE, now + GRACE + NOTICE]
  const from = new Date(now.getTime() + GRACE_DAYS * DAY_MS).toISOString();
  const to = new Date(now.getTime() + (GRACE_DAYS + RENEWAL_NOTICE_DAYS) * DAY_MS).toISOString();
  const subs = await listSubItemsByGrace(from, to);
  let sent = 0;
  for (const sub of subs) {
    if (sent >= budget) break;
    const status = subscriptionStatus(sub, now);
    if (sub.renewalNoticeFor === status.accessUntil || !sub.email) continue;
    if (new Date(status.accessUntil).getTime() <= now.getTime()) continue;
    try {
      // Claim first (conditional) so overlapping runs never double-send.
      await ddb.send(new UpdateCommand({
        TableName: table(),
        Key: subKey(sub.proId),
        UpdateExpression: 'SET renewalNoticeFor = :au',
        ConditionExpression: 'attribute_not_exists(renewalNoticeFor) OR renewalNoticeFor <> :au',
        ExpressionAttributeValues: { ':au': status.accessUntil },
      }));
    } catch (err) {
      if (isConditionalFailure(err)) continue;
      throw err;
    }
    try {
      await sendRenewalNotice({ email: sub.email, name: sub.name, accessUntil: status.accessUntil, isTrial: status.state === 'trial' });
      sent++;
    } catch (err) {
      log.error('renewal notice failed', { proId: sub.proId, err });
      await ddb.send(new UpdateCommand({
        TableName: table(),
        Key: subKey(sub.proId),
        UpdateExpression: 'REMOVE renewalNoticeFor',
        ConditionExpression: 'renewalNoticeFor = :au',
        ExpressionAttributeValues: { ':au': status.accessUntil },
      })).catch(() => undefined);
    }
  }
  return sent;
}
