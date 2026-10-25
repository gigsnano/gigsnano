/**
 * Frontend mirror of the backend project permission matrix (GIN-318).
 * The server is the security boundary; this only drives which controls the UI
 * offers, so it must stay in lockstep with shared/project_rbac.py.
 */
import { EProjectRole, EWorkspaceRole } from "@/types";

export enum EProjectPermission {
  View = "view",
  Deliver = "deliver",
  ManageSettings = "manage_settings",
  ManageMembers = "manage_members",
  TransferOwnership = "transfer_ownership",
  DeleteProject = "delete_project",
}

const VIEWER = new Set<EProjectPermission>([EProjectPermission.View]);
const MEMBER = new Set<EProjectPermission>([...VIEWER, EProjectPermission.Deliver]);
const ADMIN = new Set<EProjectPermission>([
  ...MEMBER,
  EProjectPermission.ManageSettings,
  EProjectPermission.ManageMembers,
]);
const OWNER = new Set<EProjectPermission>([
  ...ADMIN,
  EProjectPermission.TransferOwnership,
  EProjectPermission.DeleteProject,
]);

const ROLE_PERMISSIONS: Record<EProjectRole, Set<EProjectPermission>> = {
  [EProjectRole.Viewer]: VIEWER,
  [EProjectRole.Member]: MEMBER,
  [EProjectRole.Admin]: ADMIN,
  [EProjectRole.Owner]: OWNER,
};

// Workspace Owner/Admin get a governance override (full project authority).
const WORKSPACE_GOVERNANCE = new Set<EWorkspaceRole>([
  EWorkspaceRole.Owner,
  EWorkspaceRole.Admin,
]);

/** Effective allow/deny for a project action, mirroring the backend `can()`. */
export function canProject(
  workspaceRole: EWorkspaceRole | null,
  projectRole: EProjectRole | null,
  permission: EProjectPermission,
): boolean {
  if (workspaceRole && WORKSPACE_GOVERNANCE.has(workspaceRole)) return OWNER.has(permission);
  if (!projectRole) return false;
  return ROLE_PERMISSIONS[projectRole].has(permission);
}
