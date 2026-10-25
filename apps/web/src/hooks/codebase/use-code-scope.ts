import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { codeScopeService } from "@/services/codebase/code-scope.service";
import type { ISaveCodeScopePayload } from "@/types";

import { queryKeys } from "../query-keys";

export function useCodeScope(slug: string, projectId: string, storyId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.codeScope(slug, projectId, storyId),
    queryFn: () => codeScopeService.getCodeScope(slug, projectId, storyId),
    enabled: Boolean(slug && projectId && storyId) && enabled,
  });
}

export function useSaveCodeScope(slug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ISaveCodeScopePayload) =>
      codeScopeService.saveCodeScope(slug, projectId, storyId, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.codeScope(slug, projectId, storyId) }),
  });
}

export function useConfirmCodeScope(slug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => codeScopeService.confirmCodeScope(slug, projectId, storyId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.codeScope(slug, projectId, storyId) }),
  });
}

export function useResetCodeScope(slug: string, projectId: string, storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => codeScopeService.resetCodeScope(slug, projectId, storyId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.codeScope(slug, projectId, storyId) }),
  });
}
