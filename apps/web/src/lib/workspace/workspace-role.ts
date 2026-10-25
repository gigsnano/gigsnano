/**
 * Frontend mirror of the backend's `require_role(ADMIN, OWNER)` workspace gate.
 * The server is the security boundary; this only decides which controls the UI
 * offers, so it must stay in lockstep with `shared/context.py::require_role`.
 *
 * Companion to `project-rbac.ts`, which does the same job one level down.
 */
import { EMemberStatus, EWorkspaceRole, type IWorkspaceMember } from "@/types";

const ADMIN_ROLES: ReadonlySet<EWorkspaceRole> = new Set([
  EWorkspaceRole.Admin,
  EWorkspaceRole.Owner,
]);

/**
 * This account's role in the workspace, or null if it has none.
 *
 * Only an ACTIVE row counts. The members list also carries pending invitations
 * and not-yet-accepted members, and the server admits neither — treating an
 * invited admin as an admin would offer controls that 403 on use.
 */
export function workspaceRoleOf(
  members: IWorkspaceMember[] | undefined,
  userId: string | undefined,
): EWorkspaceRole | null {
  if (!members || !userId) return null;
  return (
    members.find((m) => m.user_id === userId && m.status === EMemberStatus.Active)?.role ?? null
  );
}

/**
 * Whether this role may perform workspace-admin writes — inviting, re-roling and
 * removing members, and every billing action (checkout, portal, top-up).
 *
 * An unknown role is not an admin: while members or the session are still
 * loading the answer is "no", so a control never flashes in and then vanishes.
 */
export function isWorkspaceAdmin(role: EWorkspaceRole | null): boolean {
  return role !== null && ADMIN_ROLES.has(role);
}
