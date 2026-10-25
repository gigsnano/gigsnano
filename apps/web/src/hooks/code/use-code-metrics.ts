import { useQuery } from "@tanstack/react-query";

import { codeMetricsService } from "@/services/code/code-metrics.service";

import { queryKeys } from "../query-keys";

/** The project's static code metrics. Disabled until the index is ready
 * (callers gate on `useIndexStatus` first — a 409 here means "not indexed yet"). */
export function useCodeMetrics(workspaceSlug: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.codeMetrics(workspaceSlug, projectId),
    queryFn: () => codeMetricsService.getMetrics(workspaceSlug, projectId),
    enabled: Boolean(workspaceSlug && projectId) && enabled,
  });
}
