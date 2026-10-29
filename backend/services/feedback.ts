import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { FeedbackRequest } from '../../shared/api';
import { ddb, table } from '../lib/dynamo';
import { proPk } from '../lib/keys';
import { log } from '../lib/logger';
import { hitRateLimit, RATE_RULES } from '../lib/rate-limit';
import { sendFeedbackToAdmin } from '../mail/notifications';
import { requireProfile } from './profiles';
import { loadSubscription } from './subscriptions';

const PLAN_LABELS = { trial: 'Prueba gratis', active: 'Activo', grace: 'En gracia', expired: 'Vencido' } as const;

/**
 * «Ayúdanos a mejorar»: the message is kept (`PRO#<id> / FEEDBACK#<at>`, never
 * expires: it's the product's to-do source) and emailed to the operator with
 * Reply-To = the professional, so answering is just replying. Works on an
 * expired plan too (that's when people most need to ask).
 */
export async function sendFeedback(proId: string, feedback: FeedbackRequest, now: Date = new Date()): Promise<void> {
  await hitRateLimit(RATE_RULES.feedbackPerPro, proId);
  const [profile, { status }] = await Promise.all([requireProfile(proId), loadSubscription(proId, now)]);
  const at = now.toISOString();
  await ddb.send(new PutCommand({
    TableName: table(),
    Item: { PK: proPk(proId), SK: `FEEDBACK#${at}`, proId, ...feedback, createdAt: at },
  }));
  const plan = PLAN_LABELS[status.state];
  const sent = await sendFeedbackToAdmin({ profile, feedback, plan }).catch((err: unknown) => {
    // Stored anyway: a mail hiccup must not lose the message.
    log.error('feedback email failed', { proId, err });
    return 'failed' as const;
  });
  log.info('feedback received', { proId, kind: feedback.kind, sent });
}
