import type { IAuditLog, IPrivilege, IStaffMe, IStaffMember, IStaffRole } from "@/types";

export const privilegeCatalog: IPrivilege[] = [
  { key: "dashboard.read", group: "Dashboard", label: "View the admin dashboard" },
  { key: "usage.read", group: "Usage", label: "View platform LLM token usage and cost analytics" },
  { key: "users.read", group: "Users", label: "View all users" },
  { key: "users.suspend", group: "Users", label: "Suspend users" },
  { key: "users.manage", group: "Users", label: "Edit user profile and notification preferences" },
  { key: "workspaces.read", group: "Workspaces", label: "View all workspaces" },
  { key: "workspaces.delete", group: "Workspaces", label: "Delete workspaces" },
  { key: "marketplace.moderate", group: "Marketplace", label: "Moderate marketplace listings" },
  { key: "roles.read", group: "Roles", label: "View staff roles" },
  { key: "roles.manage", group: "Roles", label: "Create, edit, and delete staff roles" },
  { key: "staff.manage", group: "Staff", label: "Grant, change, and revoke staff access" },
  { key: "audit.read", group: "Audit", label: "View the audit log" },
  { key: "notifications.read", group: "Notifications", label: "View notification templates" },
  {
    key: "notifications.manage",
    group: "Notifications",
    label: "Edit and reset notification templates",
  },
];

const ALL_KEYS = privilegeCatalog.map((p) => p.key);

export const staffRoles: IStaffRole[] = [
  {
    id: "role_superadmin",
    name: "Superadmin",
    description: "Full platform access. System role — cannot be edited or deleted.",
    privileges: [...ALL_KEYS],
    is_system: true,
    member_count: 1,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "role_support",
    name: "Support",
    description: "Read-only visibility for support staff.",
    privileges: ["users.read", "workspaces.read", "audit.read"],
    is_system: false,
    member_count: 0,
    created_at: "2026-07-02T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
  },
];

export const staffMembers: IStaffMember[] = [
  {
    id: "staff_1",
    user_id: "u_1",
    display_name: "Ada Lovelace",
    email: "ada@acme.test",
    avatar_url: null,
    role_id: "role_superadmin",
    role_name: "Superadmin",
    is_active: true,
    created_at: "2026-07-01T00:00:00Z",
  },
];

export const staffMe: IStaffMe = {
  user_id: "u_1",
  display_name: "Ada Lovelace",
  email: "ada@acme.test",
  avatar_url: null,
  role_id: "role_superadmin",
  role_name: "Superadmin",
  is_superadmin: true,
  privileges: [...ALL_KEYS],
};

export const auditLogs: IAuditLog[] = [
  {
    id: "audit_1",
    actor_staff_id: "staff_1",
    actor_name: "Ada Lovelace",
    action: "admin.access",
    target_type: null,
    target_id: null,
    metadata: null,
    ip_address: "127.0.0.1",
    created_at: "2026-07-04T09:00:00Z",
  },
  {
    id: "audit_2",
    actor_staff_id: "staff_1",
    actor_name: "Ada Lovelace",
    action: "role.create",
    target_type: "staff_role",
    target_id: "role_support",
    metadata: { after: { name: "Support", privileges: ["users.read"] } },
    ip_address: "127.0.0.1",
    created_at: "2026-07-04T09:05:00Z",
  },
];
