import { useQuery } from "@tanstack/react-query";

import { codeGraphService } from "@/services/code/code-graph.service";

import { queryKeys } from "../query-keys";

/** The project's codebase graph. Requests the full node-level graph (the
 * explorable obsidian-style view) rather than the community-aggregated summary.
 * Disabled until the index is ready (callers gate on `useIndexStatus` first — a
 * 409 here means "not indexed yet"). */
export function useCodeGraph(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.codeGraph(workspaceSlug, projectId),
    queryFn: () => codeGraphService.getGraph(workspaceSlug, projectId, "full"),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
  });
}
