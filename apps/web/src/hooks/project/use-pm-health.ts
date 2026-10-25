import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { pmHealthService } from "@/services/project/pm-health.service";
import type { ICreatePmHealthUpdate } from "@/types";

import { queryKeys } from "../query-keys";

/** Latest PM-reported health for a project (or null). */
export function useLatestPmUpdate(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.pmHealthLatest(workspaceSlug, projectId),
    queryFn: () => pmHealthService.getLatest(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

/** Full PM-update revision history, newest first. */
export function usePmUpdateHistory(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.pmHealthHistory(workspaceSlug, projectId),
    queryFn: () => pmHealthService.getHistory(workspaceSlug, projectId),
    enabled: Boolean(projectId) && enabled,
  });
}

export function useCreatePmUpdate(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreatePmHealthUpdate) =>
      pmHealthService.create(workspaceSlug, projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pmHealthLatest(workspaceSlug, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.pmHealthHistory(workspaceSlug, projectId) });
    },
  });
}
