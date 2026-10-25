import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { storyService } from "@/services/story/story.service";
import type { ITrashFilters } from "@/types";

import { queryKeys } from "../query-keys";

/** Workspace-wide trash listing (GIN-97). */
export function useTrash(workspaceSlug: string, filters: ITrashFilters = {}) {
  return useQuery({
    queryKey: queryKeys.trash(workspaceSlug, filters),
    queryFn: () => storyService.listTrash(workspaceSlug, filters),
  });
}

/** Invalidate everything a restored item should reappear in (mirrors delete). */
function invalidateAfterTrashChange(
  qc: ReturnType<typeof useQueryClient>,
  slug: string,
  projectId: string,
) {
  qc.invalidateQueries({ queryKey: ["workspaces", slug, "trash"] });
  qc.invalidateQueries({ queryKey: queryKeys.projects(slug) });
  qc.invalidateQueries({ queryKey: queryKeys.project(slug, projectId) });
  qc.invalidateQueries({ queryKey: ["workspaces", slug, "projects", projectId, "stories"] });
  qc.invalidateQueries({ queryKey: ["workspaces", slug, "projects", projectId, "cycles"] });
  qc.invalidateQueries({ queryKey: ["workspaces", slug, "projects", projectId, "modules"] });
  qc.invalidateQueries({ queryKey: ["workspaces", slug, "my-stories"] });
  qc.invalidateQueries({ queryKey: ["workspaces", slug, "stories"] });
  qc.invalidateQueries({ queryKey: queryKeys.analytics(slug) });
}

export function useRestoreStory(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, storyId }: { projectId: string; storyId: string }) =>
      storyService.restoreStory(workspaceSlug, projectId, storyId),
    onSuccess: (_data, { projectId }) => invalidateAfterTrashChange(qc, workspaceSlug, projectId),
  });
}

export function usePurgeStory(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, storyId }: { projectId: string; storyId: string }) =>
      storyService.purgeStory(workspaceSlug, projectId, storyId),
    // Purged items were already hidden from lists; trash + project counts are enough.
    onSuccess: (_data, { projectId }) => {
      qc.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "trash"] });
      qc.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
      qc.invalidateQueries({ queryKey: queryKeys.analytics(workspaceSlug) });
    },
  });
}
