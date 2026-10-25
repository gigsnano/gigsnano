import { useQuery } from "@tanstack/react-query";

import { analyticsService } from "@/services/workspace/analytics.service";
import { dashboardService } from "@/services/workspace/dashboard.service";

import { queryKeys } from "../query-keys";
import { useDashboardFilter } from "./use-dashboard-filter";
import { usePublicWidgetScope } from "./use-public-dashboard-scope";

export function useWorkspaceAnalytics(workspaceSlug: string) {
  // Sprint/velocity/KPI widgets read this. On a public dashboard the same
  // bodies run anonymously against the token-scoped roll-up, which is the same
  // shape with every id blanked (GIN-489).
  const publicScope = usePublicWidgetScope();
  // Inside a filtered dashboard, only its projects. The public roll-up applies
  // the board's stored filter server-side instead.
  const projectIds = useDashboardFilter()?.project_ids ?? [];
  return useQuery({
    queryKey: publicScope
      ? queryKeys.publicDashboardAnalytics(publicScope.token)
      : projectIds.length
        ? [...queryKeys.analytics(workspaceSlug), { project_ids: projectIds }]
        : queryKeys.analytics(workspaceSlug),
    queryFn: () =>
      publicScope
        ? dashboardService.getPublicAnalytics(publicScope.token)
        : analyticsService.getWorkspaceAnalytics(workspaceSlug, projectIds),
  });
}
