import type {
  IAuditLog,
  IAuditLogFilters,
  IAuditLogPage,
  ICreateRolePayload,
  IGrantStaffPayload,
  ILlmUsageDailyCell,
  ILlmUsageEventPage,
  ILlmUsageFilters,
  ILlmUsageHourlyCell,
  ILlmUsageMatrixRow,
  ILlmUsageRankedRow,
  ILlmUsageSummary,
  ILlmUsageTimeseriesPoint,
  IPrivilege,
  IPlatformUser,
  IPlatformUserDetail,
  IPlatformUserFilters,
  IPlatformUserPage,
  IPlatformUserWorkspace,
  IStaffMe,
  IStaffMember,
  IStaffRole,
  INotificationTemplate,
  IUpdateNotificationTemplatePayload,
  IUpdatePlatformUserPayload,
  ISetWorkspacePlanPayload,
  IAdminWorkspacePlan,
  IPlanPrice,
  ISetPlanPricePayload,
  IUpdateRolePayload,
  IUpdateStaffPayload,
  IUpdateUserSuspensionPayload,
  IOffsetPageFilters,
} from "@/types";

import { appendOffsetPageParams } from "@/lib/pagination/offset-query";
import { APIService } from "../api.service";

class AdminService extends APIService {
  private buildLlmUsageQuery(filters: ILlmUsageFilters = {}) {
    const qs = new URLSearchParams();
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    if (filters.selected_date) qs.set("selected_date", filters.selected_date);
    if (filters.workspace_id) qs.set("workspace_id", filters.workspace_id);
    if (filters.user_id) qs.set("user_id", filters.user_id);
    if (filters.source) qs.set("source", filters.source);
    if (filters.operation) qs.set("operation", filters.operation);
    if (filters.model) qs.set("model", filters.model);
    if (filters.metric) qs.set("metric", filters.metric);
    appendOffsetPageParams(qs, filters);
    return qs.toString() ? `?${qs.toString()}` : "";
  }

  getMe() {
    return this.get<IStaffMe>("/admin/me/");
  }

  getPrivileges() {
    return this.get<IPrivilege[]>("/admin/privileges/");
  }

  getRoles() {
    return this.get<IStaffRole[]>("/admin/roles/");
  }

  createRole(payload: ICreateRolePayload) {
    return this.post<IStaffRole>("/admin/roles/", payload);
  }

  updateRole(roleId: string, payload: IUpdateRolePayload) {
    return this.patch<IStaffRole>(`/admin/roles/${roleId}/`, payload);
  }

  deleteRole(roleId: string) {
    return this.delete<void>(`/admin/roles/${roleId}/`);
  }

  getStaff() {
    return this.get<IStaffMember[]>("/admin/staff/");
  }

  grantStaff(payload: IGrantStaffPayload) {
    return this.post<IStaffMember>("/admin/staff/", payload);
  }

  updateStaff(memberId: string, payload: IUpdateStaffPayload) {
    return this.patch<IStaffMember>(`/admin/staff/${memberId}/`, payload);
  }

  revokeStaff(memberId: string) {
    return this.delete<void>(`/admin/staff/${memberId}/`);
  }

  getAuditLogs(filters: IAuditLogFilters = {}) {
    const qs = new URLSearchParams();
    if (filters.action) qs.set("action", filters.action);
    if (filters.actor_staff_id) qs.set("actor_staff_id", filters.actor_staff_id);
    if (filters.created_from) qs.set("created_from", filters.created_from);
    if (filters.created_to) qs.set("created_to", filters.created_to);
    appendOffsetPageParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IAuditLogPage>(`/admin/audit-logs/${suffix}`);
  }

  getPlatformUsers(filters: IPlatformUserFilters = {}) {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.status && filters.status !== "all") qs.set("status", filters.status);
    appendOffsetPageParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IPlatformUserPage>(`/admin/users/${suffix}`);
  }

  getPlatformUser(userId: string) {
    return this.get<IPlatformUserDetail>(`/admin/users/${userId}/`);
  }

  getPlatformUserWorkspaces(userId: string) {
    return this.get<IPlatformUserWorkspace[]>(`/admin/users/${userId}/workspaces/`);
  }

  getPlatformUserActivity(userId: string, filters: IOffsetPageFilters = {}) {
    const qs = new URLSearchParams();
    appendOffsetPageParams(qs, filters);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.get<IAuditLogPage>(`/admin/users/${userId}/activity/${suffix}`);
  }

  updatePlatformUser(userId: string, payload: IUpdatePlatformUserPayload) {
    return this.patch<IPlatformUserDetail>(`/admin/users/${userId}/`, payload);
  }

  updateUserSuspension(userId: string, payload: IUpdateUserSuspensionPayload) {
    return this.updatePlatformUser(userId, payload);
  }

  getLlmUsageSummary(filters: ILlmUsageFilters = {}) {
    const suffix = this.buildLlmUsageQuery(filters);
    return this.get<ILlmUsageSummary>(`/admin/llm-usage/summary/${suffix}`);
  }

  getLlmUsageTimeseries(filters: ILlmUsageFilters = {}) {
    const suffix = this.buildLlmUsageQuery(filters);
    return this.get<ILlmUsageTimeseriesPoint[]>(`/admin/llm-usage/timeseries/${suffix}`);
  }

  getLlmUsageHeatmapDaily(filters: ILlmUsageFilters = {}) {
    const suffix = this.buildLlmUsageQuery(filters);
    return this.get<ILlmUsageDailyCell[]>(`/admin/llm-usage/heatmap-daily/${suffix}`);
  }

  getLlmUsageHeatmapHourly(filters: ILlmUsageFilters = {}) {
    const suffix = this.buildLlmUsageQuery(filters);
    return this.get<ILlmUsageHourlyCell[]>(`/admin/llm-usage/heatmap-hourly/${suffix}`);
  }

  getLlmUsageMatrix(filters: ILlmUsageFilters = {}) {
    const suffix = this.buildLlmUsageQuery(filters);
    return this.get<ILlmUsageMatrixRow[]>(`/admin/llm-usage/matrix/${suffix}`);
  }

  getLlmUsageByWorkspace(filters: ILlmUsageFilters = {}) {
    const suffix = this.buildLlmUsageQuery(filters);
    return this.get<ILlmUsageRankedRow[]>(`/admin/llm-usage/by-workspace/${suffix}`);
  }

  getLlmUsageByUser(filters: ILlmUsageFilters = {}) {
    const suffix = this.buildLlmUsageQuery(filters);
    return this.get<ILlmUsageRankedRow[]>(`/admin/llm-usage/by-user/${suffix}`);
  }

  getLlmUsageEvents(filters: ILlmUsageFilters = {}) {
    const suffix = this.buildLlmUsageQuery(filters);
    return this.get<ILlmUsageEventPage>(`/admin/llm-usage/events/${suffix}`);
  }

  getNotificationTemplates() {
    return this.get<INotificationTemplate[]>("/admin/notification-templates/");
  }

  getNotificationTemplate(triggerKey: string) {
    return this.get<INotificationTemplate>(`/admin/notification-templates/${triggerKey}/`);
  }

  updateNotificationTemplate(
    triggerKey: string,
    payload: IUpdateNotificationTemplatePayload,
  ) {
    return this.patch<INotificationTemplate>(
      `/admin/notification-templates/${triggerKey}/`,
      payload,
    );
  }

  resetNotificationTemplate(triggerKey: string) {
    return this.post<INotificationTemplate>(
      `/admin/notification-templates/${triggerKey}/reset/`,
    );
  }

  // Billing — manual plan override (GIN-30 Slice 1).
  setWorkspacePlan(workspaceSlug: string, payload: ISetWorkspacePlanPayload) {
    return this.post<IAdminWorkspacePlan>(
      `/admin/billing/workspaces/${workspaceSlug}/plan/`,
      payload,
    );
  }

  // Billing — Stripe plan-price config (GIN-30 Slice 2).
  getPlanPrices() {
    return this.get<IPlanPrice[]>("/admin/billing/plans/");
  }

  setPlanPrice(tier: string, interval: string, payload: ISetPlanPricePayload) {
    return this.put<IPlanPrice>(
      `/admin/billing/plans/${tier}/${interval}/price/`,
      payload,
    );
  }
}

export const adminService = new AdminService();
