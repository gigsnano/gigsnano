import type { IOffsetPage, IOffsetPageFilters } from "../common";

export enum EPrivilege {
  DashboardRead = "dashboard.read",
  UsageRead = "usage.read",
  UsersRead = "users.read",
  UsersSuspend = "users.suspend",
  UsersManage = "users.manage",
  WorkspacesRead = "workspaces.read",
  WorkspacesDelete = "workspaces.delete",
  MarketplaceModerate = "marketplace.moderate",
  RolesRead = "roles.read",
  RolesManage = "roles.manage",
  StaffManage = "staff.manage",
  AuditRead = "audit.read",
  NotificationsRead = "notifications.read",
  NotificationsManage = "notifications.manage",
  BillingManage = "billing.manage",
}

export enum EAuditAction {
  AdminAccess = "admin.access",
  RoleCreate = "role.create",
  RoleUpdate = "role.update",
  RoleDelete = "role.delete",
  StaffGrant = "staff.grant",
  StaffUpdate = "staff.update",
  StaffRevoke = "staff.revoke",
  UserSuspend = "user.suspend",
  UserUnsuspend = "user.unsuspend",
  UserUpdate = "user.update",
}

export interface IPrivilege {
  key: string;
  group: string;
  label: string;
}

export interface IStaffRole {
  id: string;
  name: string;
  description: string;
  privileges: string[];
  is_system: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export interface IStaffMember {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role_id: string;
  role_name: string;
  is_active: boolean;
  created_at: string;
}

export interface IStaffMe {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  role_id: string;
  role_name: string;
  is_superadmin: boolean;
  privileges: string[];
}

export interface IAuditLog {
  id: string;
  actor_staff_id: string | null;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface ICreateRolePayload {
  name: string;
  description?: string;
  privileges: string[];
}

export interface IUpdateRolePayload {
  name?: string;
  description?: string;
  privileges?: string[];
}

export interface IGrantStaffPayload {
  user_id: string;
  role_id: string;
}

export interface IUpdateStaffPayload {
  role_id?: string;
  is_active?: boolean;
}

export interface IAuditLogFilters {
  action?: string;
  actor_staff_id?: string;
  created_from?: string;
  created_to?: string;
  limit?: number;
  offset?: number;
}

export type EPlatformUserStatus = "all" | "active" | "suspended";

export interface IPlatformUser {
  id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
  auth_provider: "google" | "password" | "both";
  workspace_count: number;
  created_at: string;
}

export type IPlatformUserPage = IOffsetPage<IPlatformUser>;
export type IAuditLogPage = IOffsetPage<IAuditLog>;

export interface IPlatformUserFilters extends IOffsetPageFilters {
  q?: string;
  status?: EPlatformUserStatus;
}

export interface IUpdateUserSuspensionPayload {
  is_suspended: boolean;
  reason?: string;
}

export interface IPlatformUserDetail extends IPlatformUser {
  last_workspace_slug: string | null;
  email_digest: boolean;
  product_updates: boolean;
  project_count: number;
  assigned_story_count: number;
  is_staff: boolean;
  staff_member_id: string | null;
  staff_role_id: string | null;
  staff_role_name: string | null;
  staff_is_active: boolean | null;
  last_suspend_reason: string | null;
}

export interface IPlatformUserWorkspace {
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  role: string;
  status: string;
  joined_at: string;
}

export interface IUpdatePlatformUserPayload {
  is_suspended?: boolean;
  reason?: string;
  display_name?: string;
  email_digest?: boolean;
  product_updates?: boolean;
}

/** Admin manual plan override (GIN-30 Slice 1). tier/interval are the EPlanTier /
 * EBillingInterval values ("pro"/"annual") — kept as strings to avoid a
 * types→constants dependency. */
export interface ISetWorkspacePlanPayload {
  tier: string;
  interval?: string;
}

export interface IAdminWorkspacePlan {
  workspace_slug: string;
  tier: string;
  interval: string;
  status: string;
}

/** Admin plan-price config (GIN-30 Slice 2). */
export interface IPlanPrice {
  tier: string;
  interval: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  unit_amount_cents: number;
  currency: string;
  active: boolean;
  configured: boolean;
}

export interface ISetPlanPricePayload {
  amount_cents: number;
  currency?: string;
}
