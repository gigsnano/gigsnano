import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { solutionService } from "@/services/solution/solution.service";
import type { ICreateSetupDraftPayload, IUpdateSetupDraftPayload } from "@/types";

import { queryKeys } from "../query-keys";

/**
 * The workspace's solution registry (GIN-443). Definitions change rarely, so
 * they're held for a long staleTime; the registry's `revision` is what a
 * consumer compares when it needs to know a definition moved underneath it.
 */
export function useSolutions(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.solutions(workspaceSlug),
    queryFn: () => solutionService.getSolutions(workspaceSlug),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(workspaceSlug),
  });
}

/** The caller's resumable setup drafts (GIN-446), newest first. */
export function useSetupDrafts(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.setupDrafts(workspaceSlug),
    queryFn: () => solutionService.getSetupDrafts(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

/** Start a draft. Called on solution selection — never on opening the chooser. */
export function useCreateSetupDraft(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateSetupDraftPayload) =>
      solutionService.createSetupDraft(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.setupDrafts(workspaceSlug) });
    },
  });
}

/**
 * Autosave a draft step. Rejects with a 409 `APIError` when the draft moved on
 * another device — callers surface that as a conflict, not a lost edit.
 */
export function useUpdateSetupDraft(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, ...payload }: IUpdateSetupDraftPayload & { draftId: string }) =>
      solutionService.updateSetupDraft(workspaceSlug, draftId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.setupDrafts(workspaceSlug) });
    },
  });
}

/** Discard a draft (and its temporary uploads). */
export function useDeleteSetupDraft(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) => solutionService.deleteSetupDraft(workspaceSlug, draftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.setupDrafts(workspaceSlug) });
    },
  });
}
