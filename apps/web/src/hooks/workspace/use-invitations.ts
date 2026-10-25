import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invitationService } from "@/services/workspace/invitation.service";
import type { IInviteBatchPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useWorkspaceInvitations(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.invitations(workspaceSlug),
    queryFn: () => invitationService.getInvitations(workspaceSlug),
  });
}

/** Invalidates both lists: a pending invitation is also a row in the members
 *  view, so refreshing only one leaves the other stale. */
function useInvitationMutation<TVars, TData>(
  workspaceSlug: string,
  mutationFn: (vars: TVars) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations(workspaceSlug) });
      queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceSlug) });
    },
  });
}

export function useInviteMembers(workspaceSlug: string) {
  return useInvitationMutation(workspaceSlug, (payload: IInviteBatchPayload) =>
    invitationService.inviteMembers(workspaceSlug, payload),
  );
}

export function useResendInvitation(workspaceSlug: string) {
  return useInvitationMutation(workspaceSlug, (invitationId: string) =>
    invitationService.resendInvitation(workspaceSlug, invitationId),
  );
}

export function useRevokeInvitation(workspaceSlug: string) {
  return useInvitationMutation(workspaceSlug, (invitationId: string) =>
    invitationService.revokeInvitation(workspaceSlug, invitationId),
  );
}
