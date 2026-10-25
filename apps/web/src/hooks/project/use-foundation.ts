import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/hooks/query-keys";
import { foundationService } from "@/services/project/foundation.service";
import type { ILockFoundationPayload, IValidateDiffPayload } from "@/types/project/foundation";

export function useFoundation(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.foundation(workspaceSlug, projectId),
    queryFn: () => foundationService.getFoundation(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId),
  });
}

export function useLockFoundation(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ILockFoundationPayload) =>
      foundationService.lockFoundation(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.foundation(workspaceSlug, projectId),
      });
    },
  });
}

/** Propose / approve / reject a Foundation change (GIN-196). Each refreshes the
 * Foundation so the pending banner, version, and history stay in sync. */
export function useProposeChange(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ILockFoundationPayload) =>
      foundationService.proposeChange(workspaceSlug, projectId, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.foundation(workspaceSlug, projectId) }),
  });
}

export function useReviewChange(
  workspaceSlug: string,
  projectId: string,
  decision: "approve" | "reject",
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      decision === "approve"
        ? foundationService.approveChange(workspaceSlug, projectId)
        : foundationService.rejectChange(workspaceSlug, projectId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.foundation(workspaceSlug, projectId) }),
  });
}

export function useDetectStack(workspaceSlug: string, projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.foundation(workspaceSlug, projectId), "detect"],
    queryFn: () => foundationService.detectStack(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useValidateDiff(workspaceSlug: string, projectId: string) {
  return useMutation({
    mutationFn: (payload: IValidateDiffPayload) =>
      foundationService.validateDiff(workspaceSlug, projectId, payload),
  });
}

export function useArtifacts(workspaceSlug: string) {
  return useQuery({
    queryKey: ["foundation-artifacts", workspaceSlug],
    queryFn: () => foundationService.listArtifacts(workspaceSlug),
    enabled: Boolean(workspaceSlug),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetPins(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pinned: string[]) => foundationService.setPins(workspaceSlug, projectId, pinned),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.foundation(workspaceSlug, projectId),
      });
    },
  });
}
