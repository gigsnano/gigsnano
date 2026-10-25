import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { draftService } from "@/services/story/draft.service";
import type { IUpsertDraftPayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useDrafts(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.drafts(workspaceSlug),
    queryFn: () => draftService.getDrafts(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

export function useCreateDraft(workspaceSlug: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: IUpsertDraftPayload) =>
      draftService.createDraft(workspaceSlug, projectId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.drafts(workspaceSlug) }),
  });
}

export function useUpdateDraft(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, payload }: { draftId: string; payload: IUpsertDraftPayload }) =>
      draftService.updateDraft(workspaceSlug, draftId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.drafts(workspaceSlug) }),
  });
}

export function useDeleteDraft(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draftId: string) => draftService.deleteDraft(workspaceSlug, draftId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.drafts(workspaceSlug) }),
  });
}
