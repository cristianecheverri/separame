import { teamMemberSchema, teamRequestSchema, updateTeamSchema } from '../../../shared/schemas';
import { requirePro } from '../../lib/auth';
import { created, createApiHandler, ok, parseBody, pathParam } from '../../lib/http';
import { requireProId } from '../../services/profiles';
import { addTeamMember, createTeamRequest, getTeamResponse, updateTeam, updateTeamMember } from '../../services/teams';

/**
 * Team plan, owner side (docs/team-plan.md): ask for it, then manage the team
 * page and its members. Always acts on the signed-in owner (never on a member).
 */
export const handler = createApiHandler({
  'GET /me/team': async (event) => ok(await getTeamResponse(await requireProId(requirePro(event)))),

  'POST /me/team-request': async (event) => {
    const input = parseBody(event, teamRequestSchema);
    return created(await createTeamRequest(await requireProId(requirePro(event)), input));
  },

  'PUT /me/team': async (event) => {
    const input = parseBody(event, updateTeamSchema);
    return ok(await updateTeam(await requireProId(requirePro(event)), input));
  },

  'POST /me/team/members': async (event) => {
    const input = parseBody(event, teamMemberSchema);
    return created(await addTeamMember(await requireProId(requirePro(event)), input));
  },

  'PUT /me/team/members/{memberId}': async (event) => {
    const input = parseBody(event, teamMemberSchema);
    return ok(await updateTeamMember(await requireProId(requirePro(event)), pathParam(event, 'memberId'), input));
  },
});
