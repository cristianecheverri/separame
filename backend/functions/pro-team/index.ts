import { teamMemberSchema, teamRequestSchema, updateTeamSchema, uploadLogoSchema } from '../../../shared/schemas';
import { requirePro } from '../../lib/auth';
import { created, createApiHandler, ok, parseBody, pathParam } from '../../lib/http';
import { setLogo, storeLogo } from '../../services/media';
import { requireProId } from '../../services/profiles';
import { requireWritable } from '../../services/subscriptions';
import { addTeamMember, createTeamRequest, getTeamResponse, updateTeam, updateTeamMember } from '../../services/teams';

/**
 * Team plan, owner side (docs/team-plan.md): ask for it, then manage the team
 * page and its members. Always acts on the signed-in owner (never on a member).
 */
async function writableOwnerId(event: Parameters<typeof requirePro>[0]): Promise<string> {
  const ownerId = await requireProId(requirePro(event));
  await requireWritable(ownerId);
  return ownerId;
}

export const handler = createApiHandler({
  'PUT /me/team/logo': async (event) => {
    const input = parseBody(event, uploadLogoSchema);
    const ownerId = await writableOwnerId(event);
    const logo = await storeLogo({ kind: 'teams', ownerId }, input.image);
    await setLogo({ kind: 'teams', ownerId }, logo);
    return ok({ logo });
  },

  'DELETE /me/team/logo': async (event) => {
    await setLogo({ kind: 'teams', ownerId: await writableOwnerId(event) }, null);
    return ok({ logo: null });
  },

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
