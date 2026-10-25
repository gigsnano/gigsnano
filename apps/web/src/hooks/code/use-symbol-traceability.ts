import { useQuery } from "@tanstack/react-query";

import { codeGraphService } from "@/services/code/code-graph.service";

import { queryKeys } from "../query-keys";

/** Real code↔story links for the selected symbol (GIA-15). Returns empty for
 * nodes not in the SDLC graph (e.g. prototype fixture nodes) — harmless. */
export function useSymbolTraceability(
  workspaceSlug: string,
  projectId: string,
  nodeId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: [...queryKeys.codeGraph(workspaceSlug, projectId), "traceability", nodeId],
    queryFn: () => codeGraphService.getSymbolTraceability(workspaceSlug, projectId, nodeId!),
    enabled: Boolean(workspaceSlug && projectId && nodeId) && enabled,
  });
}
