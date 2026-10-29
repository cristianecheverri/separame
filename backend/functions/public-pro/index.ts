import { availabilityQuerySchema } from '../../../shared/schemas';
import { ApiError, createApiHandler, ok, parseQuery, pathParam, type ApiEvent } from '../../lib/http';
import { availabilityFor } from '../../services/availability';
import { getProfile, proIdBySlug, toPublicProfile } from '../../services/profiles';
import { listServices, requireService } from '../../services/services';
import { publicReferral } from '../../services/referrals';
import { loadSubscription } from '../../services/subscriptions';

/** Public profile + availability of a professional, and who a referral code belongs to (no auth). */

async function resolvePro(event: ApiEvent) {
  const slug = pathParam(event, 'slug').toLowerCase();
  const proId = await proIdBySlug(slug);
  if (!proId) throw new ApiError('not_found', 'No encontramos esta agenda.');
  return proId;
}

export const handler = createApiHandler({
  'GET /public/pros/{slug}': async (event) => {
    const proId = await resolvePro(event);
    const now = new Date();
    const [profile, services, sub] = await Promise.all([getProfile(proId), listServices(proId), loadSubscription(proId, now)]);
    if (!profile) throw new ApiError('not_found', 'No encontramos esta agenda.');
    return ok({ profile: toPublicProfile(profile, services), active: sub.status.canAcceptBookings });
  },

  'GET /public/pros/{slug}/availability': async (event) => {
    const query = parseQuery(event, availabilityQuerySchema);
    const proId = await resolvePro(event);
    const now = new Date();
    const [service, sub] = await Promise.all([
      requireService(proId, query.serviceId, { visibleOnly: true, consistent: false }),
      loadSubscription(proId, now),
    ]);
    return ok(await availabilityFor({
      proId, service, from: query.from, days: query.days, active: sub.status.canAcceptBookings, now, excludeHoldId: query.holdId,
    }));
  },

  'GET /public/referrals/{code}': async (event) => ok(await publicReferral(pathParam(event, 'code'))),
});
