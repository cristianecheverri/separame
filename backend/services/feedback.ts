import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { AdminFeedbackResponse, FeedbackEntry, FeedbackRequest, FeedbackStatus } from '../../shared/api';
import { GSI1 } from '../../shared/infra';
import { ddb, isConditionalFailure, queryAll, table, type Item } from '../lib/dynamo';
import { ApiError } from '../lib/http';
import { FEEDBACK_GSI1PK, feedbackKey } from '../lib/keys';
import { log } from '../lib/logger';
import { hitRateLimit, RATE_RULES } from '../lib/rate-limit';
import { sendFeedbackToAdmin } from '../mail/notifications';
import { requireProfile } from './profiles';
import { loadSubscription } from './subscriptions';

const PLAN_LABELS = { trial: 'Prueba gratis', active: 'Activo', grace: 'En gracia', expired: 'Vencido' } as const;
/** The admin list is small (a few per week); a hard cap keeps the query bounded anyway. */
const ADMIN_LIST_MAX = 500;

/**
 * «Ayúdanos a mejorar»: the message is kept (`PRO#<id> / FEEDBACK#<at>`, never
 * expires: it's the product's to-do source; GSI1 `FEEDBACK` lists them for the
 * admin with who sent it snapshotted) and emailed to the operator with Reply-To
 * = the professional, so answering is just replying. Works on an expired plan
 * too (that's when people most need to ask).
 */
export async function sendFeedback(proId: string, feedback: FeedbackRequest, now: Date = new Date()): Promise<void> {
  await hitRateLimit(RATE_RULES.feedbackPerPro, proId);
  const [profile, { status }] = await Promise.all([requireProfile(proId), loadSubscription(proId, now)]);
  const at = now.toISOString();
  await ddb.send(new PutCommand({
    TableName: table(),
    Item: {
      ...feedbackKey(proId, at), proId, ...feedback, createdAt: at, status: 'new' satisfies FeedbackStatus,
      name: profile.name, email: profile.email, slug: profile.slug,
      [GSI1.pk]: FEEDBACK_GSI1PK, [GSI1.sk]: `${at}#${proId}`,
    },
  }));
  const plan = PLAN_LABELS[status.state];
  const sent = await sendFeedbackToAdmin({ profile, feedback, plan }).catch((err: unknown) => {
    // Stored anyway: a mail hiccup must not lose the message.
    log.error('feedback email failed', { proId, err });
    return 'failed' as const;
  });
  log.info('feedback received', { proId, kind: feedback.kind, sent });
}

const toEntry = (item: Item): FeedbackEntry => ({
  proId: item.proId, createdAt: item.createdAt, kind: item.kind, message: item.message, ...(item.page ? { page: item.page } : {}),
  status: item.status === 'answered' ? 'answered' : 'new', name: item.name ?? '', email: item.email ?? '', slug: item.slug ?? '',
});

export async function listFeedback(): Promise<AdminFeedbackResponse> {
  const items = await queryAll({
    IndexName: GSI1.name,
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': GSI1.pk },
    ExpressionAttributeValues: { ':pk': FEEDBACK_GSI1PK },
    ScanIndexForward: false,
  }, ADMIN_LIST_MAX);
  const entries = items.map(toEntry);
  return { entries, newCount: entries.filter((e) => e.status === 'new').length };
}

export async function setFeedbackStatus(proId: string, createdAt: string, status: FeedbackStatus, now: Date = new Date()): Promise<void> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: table(),
      Key: feedbackKey(proId, createdAt),
      UpdateExpression: 'SET #st = :s, updatedAt = :u',
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':s': status, ':u': now.toISOString() },
    }));
  } catch (err) {
    if (isConditionalFailure(err)) throw new ApiError('not_found', 'Ese mensaje no existe.');
    throw err;
  }
}
