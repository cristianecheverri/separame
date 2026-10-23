import { approveTeamSchema, rejectNoticeSchema } from '../../../shared/schemas';
import { requireAdmin } from '../../lib/auth';
import { createApiHandler, noContent, ok, parseBody, pathParam } from '../../lib/http';
import { adminTeams, approveTeamRequest, rejectTeamRequest } from '../../services/teams';

/** Admin (`admin` Cognito group): team plan requests (approve with seats / reject with a reason) and active teams. */
export const handler = createApiHandler({
  'GET /admin/teams': async (event) => {
    requireAdmin(event);
    return ok(await adminTeams());
  },

  'POST /admin/team-requests/{proId}/approve': async (event) => {
    const admin = requireAdmin(event);
    const { seats } = parseBody(event, approveTeamSchema);
    await approveTeamRequest(admin, pathParam(event, 'proId'), seats);
    return noContent();
  },

  'POST /admin/team-requests/{proId}/reject': async (event) => {
    const admin = requireAdmin(event);
    const { reason } = parseBody(event, rejectNoticeSchema);
    await rejectTeamRequest(admin, pathParam(event, 'proId'), reason);
    return noContent();
  },
});
