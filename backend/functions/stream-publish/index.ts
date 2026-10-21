import type { DynamoDBStreamEvent } from 'aws-lambda';
import { PROFILE, SERVICE_PREFIX } from '../../lib/keys';
import { images, recordPk, recordSk, runBatch } from '../../lib/streams';
import { publishPro, unpublishSlug } from '../../services/publish';

/**
 * DynamoDB stream (PROFILE / SERVICE# items): regenerates the static
 * `/<slug>/index.html` page and invalidates it on CloudFront. A slug change
 * or a deleted profile removes the old page. A missing template (fresh
 * environment) is logged and skipped, never retried forever.
 */
export const handler = async (event: DynamoDBStreamEvent) => {
  // Several changes of the same pro in one batch → publish once (after the last one is seen).
  const published = new Set<string>();
  return runBatch(event.Records, async (record) => {
    const sk = recordSk(record);
    const isProfile = sk === PROFILE;
    if (!isProfile && !sk.startsWith(SERVICE_PREFIX)) return;
    const proId = recordPk(record).replace(/^PRO#/, '');
    const { oldItem, newItem } = images(record);

    if (isProfile) {
      const oldSlug = oldItem?.slug as string | undefined;
      const newSlug = newItem?.slug as string | undefined;
      if (oldSlug && oldSlug !== newSlug) await unpublishSlug(oldSlug);
      if (!newItem) return;
    }
    const lastForPro = !event.Records.slice(event.Records.indexOf(record) + 1)
      .some((r) => recordPk(r) === recordPk(record) && (recordSk(r) === PROFILE || recordSk(r).startsWith(SERVICE_PREFIX)));
    if (!lastForPro || published.has(proId)) return;
    published.add(proId);
    await publishPro(proId);
  });
};
