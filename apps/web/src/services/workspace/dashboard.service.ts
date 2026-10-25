import type {
  ICreateDashboardPayload,
  IDashboard,
  IDashboardActivity,
  IDashboardActivityParams,
  IDashboardMetrics,
  IDashboardMetricsParams,
  IPlannedWorkload,
  IPublicDashboard,
  IShareDashboardPayload,
  IUpdateDashboardPayload,
  IWorkspaceAnalytics,
} from "@/types";

import { APIService } from "../api.service";

class DashboardService extends APIService {
  getDashboards(workspaceSlug: string) {
    return this.get<IDashboard[]>(`/workspaces/${workspaceSlug}/dashboards/`);
  }

  getDashboard(workspaceSlug: string, dashboardId: string) {
    return this.get<IDashboard>(`/workspaces/${workspaceSlug}/dashboards/${dashboardId}/`);
  }

  createDashboard(workspaceSlug: string, payload: ICreateDashboardPayload) {
    return this.post<IDashboard>(`/workspaces/${workspaceSlug}/dashboards/`, payload);
  }

  updateDashboard(
    workspaceSlug: string,
    dashboardId: string,
    payload: IUpdateDashboardPayload,
  ) {
    return this.patch<IDashboard>(
      `/workspaces/${workspaceSlug}/dashboards/${dashboardId}/`,
      payload,
    );
  }

  duplicateDashboard(workspaceSlug: string, dashboardId: string) {
    return this.post<IDashboard>(
      `/workspaces/${workspaceSlug}/dashboards/${dashboardId}/duplicate/`,
      {},
    );
  }

  deleteDashboard(workspaceSlug: string, dashboardId: string) {
    return this.delete<void>(`/workspaces/${workspaceSlug}/dashboards/${dashboardId}/`);
  }

  getMetrics(workspaceSlug: string, params: IDashboardMetricsParams = {}) {
    return this.get<IDashboardMetrics>(
      `/workspaces/${workspaceSlug}/dashboards/metrics/${queryString(params)}`,
    );
  }

  getActivity(workspaceSlug: string, params: IDashboardActivityParams = {}) {
    return this.get<IDashboardActivity>(
      `/workspaces/${workspaceSlug}/dashboards/activity/${queryString(params)}`,
    );
  }

  /** Scheduled workload — separate from activity by design (GIN-527). */
  getPlannedWorkload(workspaceSlug: string, params: IDashboardActivityParams = {}) {
    return this.get<IPlannedWorkload>(
      `/workspaces/${workspaceSlug}/dashboards/planned/${queryString(params)}`,
    );
  }

  /** Publish or unpublish (GIN-489). Unpublishing drops the token server-side,
   *  which revokes every copy of the link. */
  share(workspaceSlug: string, dashboardId: string, payload: IShareDashboardPayload) {
    return this.post<IDashboard>(
      `/workspaces/${workspaceSlug}/dashboards/${dashboardId}/share/`,
      payload,
    );
  }

  /** Rotate the share token; the previous link stops resolving immediately. */
  regeneratePublicLink(workspaceSlug: string, dashboardId: string) {
    return this.post<IDashboard>(
      `/workspaces/${workspaceSlug}/dashboards/${dashboardId}/share/regenerate/`,
      {},
    );
  }

  // ── Anonymous (token-scoped) reads for the public page ──────────────────
  // No workspace slug anywhere: the token resolves the one dashboard it was
  // issued for, and each widget asks for its own data by id so the server can
  // apply the stored filters without exposing them.

  getPublicDashboard(token: string) {
    return this.get<IPublicDashboard>(`/public/dashboards/${token}/`);
  }

  getPublicWidgetMetrics(token: string, widgetId: string, params: IDashboardMetricsParams = {}) {
    return this.get<IDashboardMetrics>(
      `/public/dashboards/${token}/widgets/${widgetId}/metrics/${queryString(params)}`,
    );
  }

  getPublicWidgetActivity(
    token: string,
    widgetId: string,
    params: IDashboardActivityParams = {},
  ) {
    return this.get<IDashboardActivity>(
      `/public/dashboards/${token}/widgets/${widgetId}/activity/${queryString(params)}`,
    );
  }

  getPublicWidgetPlanned(
    token: string,
    widgetId: string,
    params: IDashboardActivityParams = {},
  ) {
    return this.get<IPlannedWorkload>(
      `/public/dashboards/${token}/widgets/${widgetId}/planned/${queryString(params)}`,
    );
  }

  getPublicAnalytics(token: string) {
    return this.get<IWorkspaceAnalytics>(`/public/dashboards/${token}/analytics/`);
  }
}

/** Serialize set params; falsy ones are dropped so "unset" means "all" server-side. */
function queryString<T extends object>(params: T): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, String(value));
  }
  return qs.toString() ? `?${qs.toString()}` : "";
}

export const dashboardService = new DashboardService();
