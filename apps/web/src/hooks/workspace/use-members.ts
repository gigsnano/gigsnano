import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { workspaceService, type IAddMemberPayload } from "@/services/workspace/workspace.service";
import type { ID, EWorkspaceRole, IWorkspaceMember } from "@/types";

import { queryKeys } from "../query-keys";
import { optimisticById } from "../optimistic";

export function useMembers(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.members(workspaceSlug),
    queryFn: () => workspaceService.getMembers(workspaceSlug),
  });
}

export function usePendingInvites() {
  return useQuery({
    queryKey: queryKeys.pendingInvites,
    queryFn: () => workspaceService.getPendingInvites(),
  });
}

export function useAddMember(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IAddMemberPayload) => workspaceService.addMember(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingInvites });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}

export function useUpdateMember(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: ID; role: EWorkspaceRole }) =>
      workspaceService.updateMember(workspaceSlug, memberId, role),
    ...optimisticById(
      queryClient,
      queryKeys.members(workspaceSlug),
      (v: { memberId: ID; role: EWorkspaceRole }) => v.memberId,
      (v) => ({ role: v.role }),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingInvites });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}

/**
 * Accept whichever kind of invitation this row is.
 *
 * `/auth/me/pending-invites/` returns both: a membership an admin created from
 * the user directory, and an invitation emailed to this address before the
 * account existed. They are the same thing to the person reading the banner, so
 * the branch belongs here rather than in every caller — an email invitation has
 * no user attached to it yet, which is what `user_id` being empty means.
 */
export function useAcceptPendingInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invite: IWorkspaceMember) =>
      invite.user_id
        ? workspaceService.acceptMember(invite.workspace_slug, invite.id)
        : workspaceService.acceptPendingInvitation(invite.id),
    onSuccess: (_data, invite) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(invite.workspace_slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(invite.workspace_slug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingInvites });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}

export function useRemoveMember(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: ID) => workspaceService.removeMember(workspaceSlug, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingInvites });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}
