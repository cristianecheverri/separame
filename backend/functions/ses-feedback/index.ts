import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { SNSEvent } from 'aws-lambda';
import { ddb, table } from '../../lib/dynamo';
import { suppressKey } from '../../lib/keys';
import { log } from '../../lib/logger';

/**
 * SES configuration-set events via SNS: permanent bounces and complaints mark
 * the address as suppressed (`SUPPRESS#<email>`), so we never write to it
 * again — the SES reputation is shared with other projects in the account.
 */

interface SesNotification {
  eventType?: string;
  notificationType?: string;
  bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress: string }[] };
  complaint?: { complainedRecipients?: { emailAddress: string }[] };
}

/** Addresses to suppress for one SES notification (pure). */
export function addressesToSuppress(n: SesNotification): { addresses: string[]; reason: 'bounce' | 'complaint' | null } {
  const type = n.eventType ?? n.notificationType;
  if (type === 'Bounce' && n.bounce?.bounceType === 'Permanent') {
    return { addresses: (n.bounce.bouncedRecipients ?? []).map((r) => r.emailAddress), reason: 'bounce' };
  }
  if (type === 'Complaint') {
    return { addresses: (n.complaint?.complainedRecipients ?? []).map((r) => r.emailAddress), reason: 'complaint' };
  }
  return { addresses: [], reason: null };
}

/** "Name <a@b.co>" → "a@b.co". */
const bareAddress = (value: string) => (/<([^>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();

export const handler = async (event: SNSEvent): Promise<void> => {
  for (const record of event.Records) {
    let notification: SesNotification;
    try {
      notification = JSON.parse(record.Sns.Message) as SesNotification;
    } catch {
      log.warn('ses feedback: not JSON');
      continue;
    }
    const { addresses, reason } = addressesToSuppress(notification);
    for (const raw of addresses) {
      const email = bareAddress(raw);
      if (!email) continue;
      await ddb.send(new PutCommand({
        TableName: table(),
        Item: { ...suppressKey(email), email, reason, at: new Date().toISOString() },
      }));
      log.info('address suppressed', { reason });
    }
  }
};
