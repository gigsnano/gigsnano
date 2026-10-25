import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useProject } from "@/hooks/project/use-projects";
import { codeGraphService } from "@/services/code/code-graph.service";

import { queryKeys } from "../query-keys";

/** Thin selector over the project's codebase-index fields (already on
 * `IProject` — no separate fetch). */
export function useIndexStatus(workspaceSlug: string, projectId: string) {
  const query = useProject(workspaceSlug, projectId);
  return {
    ...query,
    status: query.data?.index_status,
    error: query.data?.index_error ?? null,
    commitSha: query.data?.indexed_commit_sha ?? null,
    indexedAt: query.data?.indexed_at ?? null,
  };
}

/** Kick off (or retry) a codebase index build; invalidates the project so the
 * banner picks up the new `index_status`. */
export function useStartIndex(workspaceSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => codeGraphService.startIndex(workspaceSlug, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      // Re-index changes every code artifact — refetch the overview so it flips to
      // its indexing state immediately and repopulates when the build finishes.
      queryClient.invalidateQueries({ queryKey: queryKeys.codeOverview(workspaceSlug, projectId) });
    },
  });
}
