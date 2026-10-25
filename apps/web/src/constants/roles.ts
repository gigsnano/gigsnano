import { EProjectRole, EWorkspaceRole } from "@/types";

export const WORKSPACE_ROLE_LABEL: Record<EWorkspaceRole, string> = {
  [EWorkspaceRole.Guest]: "Guest",
  [EWorkspaceRole.Member]: "Member",
  [EWorkspaceRole.Admin]: "Admin",
  [EWorkspaceRole.Owner]: "Owner",
};

export const PROJECT_ROLE_LABEL: Record<EProjectRole, string> = {
  [EProjectRole.Owner]: "Owner",
  [EProjectRole.Admin]: "Admin",
  [EProjectRole.Member]: "Member",
  [EProjectRole.Viewer]: "Viewer",
};

/** Roles an admin can assign (Owner is not reassignable via the UI). */
export const ASSIGNABLE_WORKSPACE_ROLES: EWorkspaceRole[] = [
  EWorkspaceRole.Admin,
  EWorkspaceRole.Member,
  EWorkspaceRole.Guest,
];

export const ASSIGNABLE_PROJECT_ROLES: EProjectRole[] = [
  EProjectRole.Admin,
  EProjectRole.Member,
  EProjectRole.Viewer,
];
