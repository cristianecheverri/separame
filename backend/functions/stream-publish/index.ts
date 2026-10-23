import type { DynamoDBStreamEvent } from 'aws-lambda';
import { PROFILE, SERVICE_PREFIX, TEAM } from '../../lib/keys';
import { images, recordPk, recordSk, runBatch } from '../../lib/streams';
import { publishPro, publishTeam, teamOwnerFor, unpublishSlug } from '../../services/publish';

/**
 * DynamoDB stream (PROFILE / SERVICE# / TEAM items): regenerates the static
 * `/<slug>/index.html` pages and invalidates them on CloudFront. A slug change
 * or a deleted profile removes the old page. A profile or service change of a
 * team member (or owner) also regenerates the team page `/<teamSlug>`. A
 * missing template (fresh environment) is logged and skipped, never retried forever.
 */
export const handler = async (event: DynamoDBStreamEvent) => {
  // Several changes of the same pro / team in one batch → publish once (after the last one is seen).
  const published = new Set<string>();
  const teamsPublished = new Set<string>();
  const isPageItem = (sk: string) => sk === PROFILE || sk === TEAM || sk.startsWith(SERVICE_PREFIX);

  const publishTeamOnce = async (ownerId: string) => {
    if (teamsPublished.has(ownerId)) return;
    teamsPublished.add(ownerId);
    await publishTeam(ownerId);
  };

  return runBatch(event.Records, async (record) => {
    const sk = recordSk(record);
    if (!isPageItem(sk)) return;
    const proId = recordPk(record).replace(/^PRO#/, '');
    const { oldItem, newItem } = images(record);

    if (sk === PROFILE || sk === TEAM) {
      const oldSlug = oldItem?.slug as string | undefined;
      const newSlug = newItem?.slug as string | undefined;
      if (oldSlug && oldSlug !== newSlug) await unpublishSlug(oldSlug);
      if (!newItem) return;
    }
    // Publish once per group (the pro's page vs. the team page) after its last record in the batch.
    const sameGroup = (other: string) => (sk === TEAM ? other === TEAM : isPageItem(other) && other !== TEAM);
    const lastOfGroup = !event.Records.slice(event.Records.indexOf(record) + 1)
      .some((r) => recordPk(r) === recordPk(record) && sameGroup(recordSk(r)));
    if (!lastOfGroup) return;

    if (sk === TEAM) {
      await publishTeamOnce(proId);
      // A new or renamed team: every member page (owner included) shows «Parte de <name>» with its link.
      const renamed = !oldItem || oldItem.name !== newItem?.name || oldItem.slug !== newItem?.slug;
      if (!renamed) return;
      for (const id of [proId, ...((newItem?.memberIds as string[] | undefined) ?? [])]) {
        if (published.has(id)) continue;
        published.add(id);
        await publishPro(id);
      }
      return;
    }
    if (published.has(proId)) return;
    published.add(proId);
    await publishPro(proId);
    const ownerId = await teamOwnerFor(proId);
    if (ownerId) await publishTeamOnce(ownerId);
  });
};
