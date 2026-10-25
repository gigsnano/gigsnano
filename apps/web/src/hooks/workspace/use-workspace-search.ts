import { useQuery } from "@tanstack/react-query";

import { workspaceSearchService } from "@/services/workspace/workspace-search.service";
import type { IWorkspaceSearchParams } from "@/services/workspace/workspace-search.service";

import { queryKeys } from "../query-keys";

/** Grouped multi-entity search (GIN-35) backing the command palette's search section. */
export function useWorkspaceSearch(
  workspaceSlug: string,
  params: IWorkspaceSearchParams,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.workspaceSearch(workspaceSlug, params),
    queryFn: () => workspaceSearchService.search(workspaceSlug, params),
    enabled: enabled && (params.q?.length ?? 0) > 0,
  });
}
