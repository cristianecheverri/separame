import { onboardingSchema, slugCheckQuerySchema, updateProfileSchema } from '../../../shared/schemas';
import { requirePro } from '../../lib/auth';
import { created, createApiHandler, ok, parseBody, parseQuery } from '../../lib/http';
import { log } from '../../lib/logger';
import { getMe, onboard, slugCheck, updateProfile } from '../../services/profiles';
import { unpublishSlug } from '../../services/publish';
import { getTeamResponse, syncMembersWithOwner } from '../../services/teams';

/** Current professional: me, onboarding, profile edit (incl. slug change) and slug availability. */
export const handler = createApiHandler({
  'GET /me': async (event) => {
    const me = await getMe(requirePro(event));
    if (!me.profile) return ok(me);
    const { team, request } = await getTeamResponse(me.profile.id);
    return ok({ ...me, team, teamRequest: request });
  },

  'POST /me/onboarding': async (event) => {
    const user = requirePro(event);
    const input = parseBody(event, onboardingSchema);
    return created(await onboard(user, input));
  },

  'PUT /me/profile': async (event) => {
    const user = requirePro(event);
    const input = parseBody(event, updateProfileSchema);
    const { previousSlug, ...response } = await updateProfile(user, input);
    await syncMembersWithOwner(response.profile).catch((err) => log.error('team members sync failed', { proId: response.profile.id, err }));
    if (previousSlug) {
      // stream-publish also removes it from the PROFILE change; this makes the old link die immediately.
      await unpublishSlug(previousSlug).catch((err) => log.warn('old page removal failed', { proId: response.profile.id, err }));
    }
    return ok(response);
  },

  'GET /me/slug-check': async (event) => {
    const user = requirePro(event);
    const { slug } = parseQuery(event, slugCheckQuerySchema);
    return ok(await slugCheck(user, slug));
  },
});
