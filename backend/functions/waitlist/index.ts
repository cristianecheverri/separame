import { joinTeamWaitlistSchema, joinWaitlistSchema } from '../../../shared/schemas';
import { ApiError, created, createApiHandler, noContent, ok, parseBody, pathParam, sourceIp } from '../../lib/http';
import { hitRateLimit, RATE_RULES } from '../../lib/rate-limit';
import { verifyTurnstile } from '../../lib/turnstile';
import { proIdBySlug } from '../../services/profiles';
import { actingProId, getTeamItem, teamOwnerBySlug } from '../../services/teams';
import { requireService } from '../../services/services';
import { assertBookable, loadSubscription } from '../../services/subscriptions';
import { deleteWaitlistEntry, joinWaitlist, leaveWaitlist, listWaitlist } from '../../services/waitlist';

/**
 * Waitlist: clients join from the public page (same anti-spam as bookings)
 * and leave with the signed link from the emails (`/w/<token>`); the pro
 * lists and removes entries. Emails and offers go out from the stream.
 */
export const handler = createApiHandler({
  'POST /public/pros/{slug}/waitlist': async (event) => {
    const input = parseBody(event, joinWaitlistSchema);
    const ip = sourceIp(event);
    await hitRateLimit(RATE_RULES.waitlistPerIp, ip);
    await hitRateLimit(RATE_RULES.waitlistPerEmail, input.client.email);
    if (!(await verifyTurnstile(input.turnstileToken, ip))) throw new ApiError('captcha_failed');

    const proId = await proIdBySlug(pathParam(event, 'slug').toLowerCase());
    if (!proId) throw new ApiError('not_found', 'No encontramos esta agenda.');
    const now = new Date();
    assertBookable((await loadSubscription(proId, now)).status);
    const service = await requireService(proId, input.serviceId, { visibleOnly: true });
    return created(await joinWaitlist(proId, input, service.name, now));
  },

  // «Cualquiera disponible» on a team page: one captcha, one entry per member offering the service.
  'POST /public/teams/{slug}/waitlist': async (event) => {
    const { offerings, ...input } = parseBody(event, joinTeamWaitlistSchema);
    const ip = sourceIp(event);
    await hitRateLimit(RATE_RULES.waitlistPerIp, ip);
    await hitRateLimit(RATE_RULES.waitlistPerEmail, input.client.email);
    if (!(await verifyTurnstile(input.turnstileToken, ip))) throw new ApiError('captcha_failed');

    const ownerId = await teamOwnerBySlug(pathParam(event, 'slug').toLowerCase());
    const team = ownerId ? await getTeamItem(ownerId, true) : undefined;
    if (!ownerId || !team) throw new ApiError('not_found', 'No encontramos esta agenda.');
    const now = new Date();
    assertBookable((await loadSubscription(ownerId, now)).status);
    const members = new Set([ownerId, ...team.memberIds]);
    const joined = [];
    let failure: unknown = null;
    for (const offering of offerings) {
      const proId = await proIdBySlug(offering.slug);
      if (!proId || !members.has(proId)) throw new ApiError('not_found', 'Ese profesional no está en este equipo.');
      try {
        const service = await requireService(proId, offering.serviceId, { visibleOnly: true });
        joined.push(await joinWaitlist(proId, { ...input, serviceId: offering.serviceId }, service.name, now, { quietJoin: joined.length > 0 }));
      } catch (err) {
        failure ??= err; // e.g. already on that member's list: the others still count
      }
    }
    if (joined.length === 0) throw failure;
    return created(joined[0]);
  },

  'POST /public/waitlist/{token}/leave': async (event) => {
    await hitRateLimit(RATE_RULES.managePerIp, sourceIp(event));
    return ok(await leaveWaitlist(pathParam(event, 'token')));
  },

  'GET /me/waitlist': async (event) => {
    const proId = await actingProId(event);
    return ok({ entries: await listWaitlist(proId) });
  },

  'DELETE /me/waitlist/{entryId}': async (event) => {
    const proId = await actingProId(event);
    await deleteWaitlistEntry(proId, pathParam(event, 'entryId'));
    return noContent();
  },
});
