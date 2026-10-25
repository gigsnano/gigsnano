import type { IPlatformUserDetail } from "@/types";

import { staffMembers } from "./admin";
import { users } from "./users";
import { workspaceMembers, workspaces } from "./workspaces";

export const platformUsers: IPlatformUserDetail[] = users.map((u, i) => {
  const staff = staffMembers.find((m) => m.user_id === u.id);
  return {
    ...u,
    is_suspended: i === 2,
    suspended_at: i === 2 ? "2026-06-01T12:00:00Z" : null,
    auth_provider: i % 3 === 0 ? "both" : i % 2 === 0 ? "google" : "password",
    workspace_count: workspaceMembers.filter((m) => m.user_id === u.id).length,
    created_at: "2026-01-15T00:00:00Z",
    last_workspace_slug: i === 0 ? "acme" : null,
    email_digest: i % 2 === 0,
    product_updates: true,
    project_count: i % 4,
    assigned_story_count: i % 5,
    is_staff: Boolean(staff),
    staff_member_id: staff?.id ?? null,
    staff_role_id: staff?.role_id ?? null,
    staff_role_name: staff?.role_name ?? null,
    staff_is_active: staff?.is_active ?? null,
    last_suspend_reason: i === 2 ? "Policy review" : null,
  };
});

export function platformUserWorkspaces(userId: string) {
  return workspaceMembers
    .filter((m) => m.user_id === userId)
    .map((m) => {
      const ws = workspaces.find((w) => w.slug === m.workspace_slug);
      return {
        workspace_id: ws?.id ?? m.workspace_slug,
        workspace_slug: m.workspace_slug,
        workspace_name: ws?.name ?? m.workspace_slug,
        role: m.role,
        status: m.status,
        joined_at: "2026-01-15T00:00:00Z",
      };
    });
}
