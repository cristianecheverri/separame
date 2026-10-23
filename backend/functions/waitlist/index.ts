import { joinWaitlistSchema } from '../../../shared/schemas';
import { ApiError, created, createApiHandler, noContent, ok, parseBody, pathParam, sourceIp } from '../../lib/http';
import { hitRateLimit, RATE_RULES } from '../../lib/rate-limit';
import { verifyTurnstile } from '../../lib/turnstile';
import { proIdBySlug } from '../../services/profiles';
import { actingProId } from '../../services/teams';
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
