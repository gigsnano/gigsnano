import { useQuery } from "@tanstack/react-query";

import { codeGraphService } from "@/services/code/code-graph.service";
import type { ICodebaseOverview } from "@/types/code/overview";

import { queryKeys } from "../query-keys";

/** The Codebase Overview aggregation (GIN-272). Backs the whole redesigned Overview
 * dashboard from one request. The endpoint never 409s — it returns a usable surface
 * in every index state — so this hook is NOT gated on `useIndexStatus`; the returned
 * `state` (`none`/`indexing`/`empty`/`stale`/`ready`/`failed`) drives the UI. Polls
 * while an index is in flight so the dashboard fills in as the build completes. */
export function useCodebaseOverview(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.codeOverview(workspaceSlug, projectId),
    queryFn: () => codeGraphService.getOverview(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
    refetchInterval: (query) => {
      const data = query.state.data as ICodebaseOverview | undefined;
      return data?.state === "indexing" ? 5000 : false;
    },
  });
}
