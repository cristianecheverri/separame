/** Team plan (owner side): request, team page and members. Every change refreshes /me (it carries the team). */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type CreateTeamRequestBody, type TeamResponse, type UpdateTeamBody, type UpsertTeamMemberBody } from '@shared/api';
import { api } from '../../lib/api';
import { keys } from '../../lib/queries';

/** Team routes always act on the owner: never send the acting header. */
const OWNER = { actingProId: null } as const;

function useRefreshMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.me });
}

export function useSendTeamRequest() {
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: (body: CreateTeamRequestBody) => api.post<TeamResponse>(apiPaths.teamRequest(), body, OWNER),
    onSuccess: refresh,
  });
}

export function useUpdateTeam() {
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: (body: UpdateTeamBody) => api.put<TeamResponse>(apiPaths.team(), body, OWNER),
    onSuccess: refresh,
  });
}

/** Creates a member (`proId` null) or edits one. */
export function useSaveMember() {
  const refresh = useRefreshMe();
  return useMutation({
    mutationFn: ({ proId, body }: { proId: string | null; body: UpsertTeamMemberBody }) =>
      proId ? api.put<TeamResponse>(apiPaths.teamMember(proId), body, OWNER) : api.post<TeamResponse>(apiPaths.teamMembers(), body, OWNER),
    onSuccess: refresh,
  });
}
