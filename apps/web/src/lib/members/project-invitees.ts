import { EInvitationStatus, EProjectRole, type IWorkspaceInvitation } from "@/types";

/** Someone invited to the workspace who joins this project when they accept. */
export interface IProjectInvitee {
  /** The *invitation* id — revoking is a workspace-level act, not a project one. */
  invitation_id: string;
  email: string;
  role: EProjectRole;
}

/**
 * Who is on the way to a project but has no membership row yet (GIN-529).
 *
 * These come from the invitations list rather than the project member list on
 * purpose: twelve screens read project members — assignee pickers, @-mentions,
 * workload — and every one of them would have to learn to skip a row with no
 * user behind it. Membership stays "people who exist"; the promise stays on the
 * invitation until it is redeemed.
 */
export function pendingProjectInvitees(
  invitations: IWorkspaceInvitation[] | undefined,
  projectId: string,
): IProjectInvitee[] {
  return (invitations ?? []).flatMap((invitation) => {
    // Settled rows are kept for the Invitations history screen, so status is
    // the filter — an accepted invitation is already a real member below.
    if (invitation.status !== EInvitationStatus.Pending) return [];
    const grant = invitation.project_grants?.find((g) => g.project_id === projectId);
    return grant
      ? [{ invitation_id: invitation.id, email: invitation.email, role: grant.role }]
      : [];
  });
}

/** Project ids an outstanding invitation already promises to `email`, so the
 *  invite dialog can preselect them instead of silently replacing the set. */
export function grantedProjectIds(
  invitations: IWorkspaceInvitation[] | undefined,
  email: string,
): string[] {
  const needle = email.trim().toLowerCase();
  const live = (invitations ?? []).find(
    (i) => i.email.toLowerCase() === needle && i.status === EInvitationStatus.Pending,
  );
  return (live?.project_grants ?? []).map((g) => g.project_id);
}

/** Role shown for an invitee with a malformed grant. Never trust a JSON column
 *  to hold a value the enum still has. */
export function safeProjectRole(role: string): EProjectRole {
  return Object.values(EProjectRole).includes(role as EProjectRole)
    ? (role as EProjectRole)
    : EProjectRole.Member;
}
