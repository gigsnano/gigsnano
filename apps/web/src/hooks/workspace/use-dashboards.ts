import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { applyDashboardFilters } from "@/lib/dashboards/widget-filters";
import { dashboardService } from "@/services/workspace/dashboard.service";
import type {
  ICreateDashboardPayload,
  IDashboardActivityParams,
  IDashboardMetricsParams,
  IUpdateDashboardPayload,
} from "@/types";
import type { EDashboardVisibility, IDashboardFilters } from "@/types";

import { queryKeys } from "../query-keys";
import { useDashboardFilter } from "./use-dashboard-filter";
import { usePublicWidgetScope } from "./use-public-dashboard-scope";

export function useDashboards(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.dashboards(workspaceSlug),
    queryFn: () => dashboardService.getDashboards(workspaceSlug),
  });
}

export function useDashboard(workspaceSlug: string, dashboardId: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(workspaceSlug, dashboardId),
    queryFn: () => dashboardService.getDashboard(workspaceSlug, dashboardId),
    enabled: Boolean(dashboardId),
  });
}

/** Only the date window and bucketing travel to a public endpoint — every
 *  identity filter is read from the widget's stored settings server-side
 *  (GIN-489). */
const datesOnly = (params: IDashboardActivityParams) => ({
  date_from: params.date_from,
  date_to: params.date_to,
  bucket: params.bucket,
});

/** Chart windows are resolved (clamped, bucketed) by `useChartControls`. */
const projectsOnly = (filters: IDashboardFilters | null) =>
  filters && { project_ids: filters.project_ids };

export function useDashboardMetrics(
  workspaceSlug: string,
  widgetParams: IDashboardMetricsParams = {},
) {
  const params = applyDashboardFilters(widgetParams, useDashboardFilter());
  // On a public dashboard the same widget bodies run anonymously: same shape,
  // token-scoped endpoint. See use-public-dashboard-scope.
  const publicScope = usePublicWidgetScope();
  return useQuery({
    queryKey: publicScope
      ? queryKeys.publicDashboardMetrics(publicScope.token, publicScope.widgetId, params)
      : queryKeys.dashboardMetrics(workspaceSlug, params),
    queryFn: () =>
      publicScope
        ? dashboardService.getPublicWidgetMetrics(
            publicScope.token,
            publicScope.widgetId,
            datesOnly(params),
          )
        : dashboardService.getMetrics(workspaceSlug, params),
  });
}

/** What happened per period — created/updated/completed (GIN-163, GIN-527). */
export function useDashboardActivity(
  workspaceSlug: string,
  widgetParams: IDashboardActivityParams = {},
) {
  // Project filter only: the window arrives already fitted by useChartControls.
  const params = applyDashboardFilters(widgetParams, projectsOnly(useDashboardFilter()));
  const publicScope = usePublicWidgetScope();
  return useQuery({
    queryKey: publicScope
      ? queryKeys.publicDashboardActivity(publicScope.token, publicScope.widgetId, params)
      : queryKeys.dashboardActivity(workspaceSlug, params),
    queryFn: () =>
      publicScope
        ? dashboardService.getPublicWidgetActivity(
            publicScope.token,
            publicScope.widgetId,
            datesOnly(params),
          )
        : dashboardService.getActivity(workspaceSlug, params),
  });
}

/** What is scheduled per period — starting/due/overdue (GIN-527). */
export function usePlannedWorkload(
  workspaceSlug: string,
  widgetParams: IDashboardActivityParams = {},
) {
  const params = applyDashboardFilters(widgetParams, projectsOnly(useDashboardFilter()));
  const publicScope = usePublicWidgetScope();
  return useQuery({
    queryKey: publicScope
      ? queryKeys.publicDashboardPlanned(publicScope.token, publicScope.widgetId, params)
      : queryKeys.dashboardPlanned(workspaceSlug, params),
    queryFn: () =>
      publicScope
        ? dashboardService.getPublicWidgetPlanned(
            publicScope.token,
            publicScope.widgetId,
            datesOnly(params),
          )
        : dashboardService.getPlannedWorkload(workspaceSlug, params),
  });
}

/** The published dashboard behind a share token — the public page's only entry
 *  point. `retry: false` so a revoked link fails straight to "unavailable"
 *  instead of retrying an endpoint that will never succeed. */
export function usePublicDashboard(token: string) {
  return useQuery({
    queryKey: queryKeys.publicDashboard(token),
    queryFn: () => dashboardService.getPublicDashboard(token),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useShareDashboard(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      dashboardId,
      visibility,
    }: {
      dashboardId: string;
      visibility: EDashboardVisibility;
    }) => dashboardService.share(workspaceSlug, dashboardId, { visibility }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards(workspaceSlug) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard(workspaceSlug, updated.id),
      });
    },
  });
}

export function useRegeneratePublicLink(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dashboardId: string) =>
      dashboardService.regeneratePublicLink(workspaceSlug, dashboardId),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards(workspaceSlug) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard(workspaceSlug, updated.id),
      });
    },
  });
}

export function useCreateDashboard(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateDashboardPayload) =>
      dashboardService.createDashboard(workspaceSlug, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards(workspaceSlug) });
    },
  });
}

export function useUpdateDashboard(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      dashboardId,
      payload,
    }: {
      dashboardId: string;
      payload: IUpdateDashboardPayload;
    }) => dashboardService.updateDashboard(workspaceSlug, dashboardId, payload),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards(workspaceSlug) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.dashboard(workspaceSlug, updated.id),
      });
    },
  });
}

export function useDuplicateDashboard(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dashboardId: string) =>
      dashboardService.duplicateDashboard(workspaceSlug, dashboardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards(workspaceSlug) });
    },
  });
}

export function useDeleteDashboard(workspaceSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dashboardId: string) =>
      dashboardService.deleteDashboard(workspaceSlug, dashboardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboards(workspaceSlug) });
    },
  });
}
