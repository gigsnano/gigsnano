import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminService } from "@/services/admin/admin.service";
import type {
  IAuditLogFilters,
  ICreateRolePayload,
  IGrantStaffPayload,
  ILlmUsageFilters,
  IPlatformUserFilters,
  IUpdateRolePayload,
  IUpdateStaffPayload,
  IUpdatePlatformUserPayload,
  ISetWorkspacePlanPayload,
  ISetPlanPricePayload,
  IUpdateNotificationTemplatePayload,
  IUpdateUserSuspensionPayload,
  IOffsetPageFilters,
} from "@/types";

import { queryKeys } from "../query-keys";

export function useStaffMe() {
  return useQuery({
    queryKey: queryKeys.adminMe,
    queryFn: () => adminService.getMe(),
    retry: false, // a 403/401 should surface immediately to the gate
  });
}

export function usePrivileges() {
  return useQuery({
    queryKey: queryKeys.adminPrivileges,
    queryFn: () => adminService.getPrivileges(),
  });
}

export function useStaffRoles() {
  return useQuery({
    queryKey: queryKeys.adminRoles,
    queryFn: () => adminService.getRoles(),
  });
}

export function useStaffMembers() {
  return useQuery({
    queryKey: queryKeys.adminStaff,
    queryFn: () => adminService.getStaff(),
  });
}

export function useAuditLogs(filters: IAuditLogFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminAuditLogs(filters),
    queryFn: () => adminService.getAuditLogs(filters),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateRolePayload) => adminService.createRole(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminRoles }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, payload }: { roleId: string; payload: IUpdateRolePayload }) =>
      adminService.updateRole(roleId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminRoles });
      qc.invalidateQueries({ queryKey: queryKeys.adminStaff });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => adminService.deleteRole(roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adminRoles }),
  });
}

export function useGrantStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: IGrantStaffPayload) => adminService.grantStaff(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminStaff });
      qc.invalidateQueries({ queryKey: queryKeys.adminRoles });
      qc.invalidateQueries({ queryKey: ["admin", "platform-users"] });
    },
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, payload }: { memberId: string; payload: IUpdateStaffPayload }) =>
      adminService.updateStaff(memberId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminStaff });
      qc.invalidateQueries({ queryKey: ["admin", "platform-users"] });
    },
  });
}

export function useRevokeStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => adminService.revokeStaff(memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminStaff });
      qc.invalidateQueries({ queryKey: queryKeys.adminRoles });
      qc.invalidateQueries({ queryKey: ["admin", "platform-users"] });
    },
  });
}

export function usePlatformUsers(filters: IPlatformUserFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminPlatformUsers(filters),
    queryFn: () => adminService.getPlatformUsers(filters),
  });
}

export function usePlatformUser(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.adminPlatformUser(userId ?? ""),
    queryFn: () => adminService.getPlatformUser(userId!),
    enabled: Boolean(userId),
  });
}

export function usePlatformUserWorkspaces(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.adminPlatformUserWorkspaces(userId),
    queryFn: () => adminService.getPlatformUserWorkspaces(userId),
    enabled: enabled && Boolean(userId),
  });
}

export function usePlatformUserActivity(
  userId: string,
  filters: IOffsetPageFilters = {},
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.adminPlatformUserActivity(userId, filters),
    queryFn: () => adminService.getPlatformUserActivity(userId, filters),
    enabled: enabled && Boolean(userId),
  });
}

export function useUpdatePlatformUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: IUpdatePlatformUserPayload }) =>
      adminService.updatePlatformUser(userId, payload),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: ["admin", "platform-users"] });
      qc.setQueryData(queryKeys.adminPlatformUser(user.id), user);
      qc.invalidateQueries({ queryKey: queryKeys.adminPlatformUserActivity(user.id) });
      qc.invalidateQueries({ queryKey: queryKeys.adminAuditLogs() });
    },
  });
}

export function useUpdateUserSuspension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: IUpdateUserSuspensionPayload }) =>
      adminService.updateUserSuspension(userId, payload),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: ["admin", "platform-users"] });
      qc.setQueryData(queryKeys.adminPlatformUser(user.id), user);
      qc.invalidateQueries({ queryKey: queryKeys.adminPlatformUserActivity(user.id) });
      qc.invalidateQueries({ queryKey: queryKeys.adminAuditLogs() });
    },
  });
}

export function useLlmUsageSummary(filters: ILlmUsageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminLlmUsageSummary(filters),
    queryFn: () => adminService.getLlmUsageSummary(filters),
  });
}

export function useLlmUsageTimeseries(filters: ILlmUsageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminLlmUsageTimeseries(filters),
    queryFn: () => adminService.getLlmUsageTimeseries(filters),
  });
}

export function useLlmUsageHeatmapDaily(filters: ILlmUsageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminLlmUsageHeatmapDaily(filters),
    queryFn: () => adminService.getLlmUsageHeatmapDaily(filters),
  });
}

export function useLlmUsageHeatmapHourly(filters: ILlmUsageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminLlmUsageHeatmapHourly(filters),
    queryFn: () => adminService.getLlmUsageHeatmapHourly(filters),
  });
}

export function useLlmUsageMatrix(filters: ILlmUsageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminLlmUsageMatrix(filters),
    queryFn: () => adminService.getLlmUsageMatrix(filters),
  });
}

export function useLlmUsageByWorkspace(filters: ILlmUsageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminLlmUsageByWorkspace(filters),
    queryFn: () => adminService.getLlmUsageByWorkspace(filters),
  });
}

export function useLlmUsageByUser(filters: ILlmUsageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminLlmUsageByUser(filters),
    queryFn: () => adminService.getLlmUsageByUser(filters),
  });
}

export function useLlmUsageEvents(filters: ILlmUsageFilters = {}) {
  return useQuery({
    queryKey: queryKeys.adminLlmUsageEvents(filters),
    queryFn: () => adminService.getLlmUsageEvents(filters),
  });
}

export function useNotificationTemplates() {
  return useQuery({
    queryKey: queryKeys.adminNotificationTemplates,
    queryFn: () => adminService.getNotificationTemplates(),
  });
}

export function useUpdateNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      triggerKey,
      payload,
    }: {
      triggerKey: string;
      payload: IUpdateNotificationTemplatePayload;
    }) => adminService.updateNotificationTemplate(triggerKey, payload),
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: queryKeys.adminNotificationTemplates });
      qc.setQueryData(queryKeys.adminNotificationTemplate(template.trigger_key), template);
    },
  });
}

export function useResetNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (triggerKey: string) => adminService.resetNotificationTemplate(triggerKey),
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: queryKeys.adminNotificationTemplates });
      qc.setQueryData(queryKeys.adminNotificationTemplate(template.trigger_key), template);
    },
  });
}

/** Admin manual plan override (GIN-30 Slice 1). */
export function useSetWorkspacePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, payload }: { slug: string; payload: ISetWorkspacePlanPayload }) =>
      adminService.setWorkspacePlan(slug, payload),
    onSuccess: (plan) => {
      // The workspace's subscription changed — refresh its view if it's cached.
      qc.invalidateQueries({ queryKey: queryKeys.subscription(plan.workspace_slug) });
    },
  });
}

/** Admin Stripe plan-price config (GIN-30 Slice 2). */
export function usePlanPrices() {
  return useQuery({
    queryKey: queryKeys.adminPlanPrices,
    queryFn: () => adminService.getPlanPrices(),
  });
}

export function useSetPlanPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tier,
      interval,
      payload,
    }: {
      tier: string;
      interval: string;
      payload: ISetPlanPricePayload;
    }) => adminService.setPlanPrice(tier, interval, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.adminPlanPrices });
    },
  });
}
