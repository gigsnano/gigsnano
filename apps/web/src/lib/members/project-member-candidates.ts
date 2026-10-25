import { EMemberStatus, type IWorkspaceMember } from "@/types";

/** A workspace member offered as a project-member candidate. */
export interface IMemberCandidate {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  /** Workspace invite still outstanding — they join the project when they accept. */
  invited: boolean;
}

/**
 * Who can be added to a project, from the workspace pool (GIN-528).
 *
 * Invited-but-not-yet-accepted members are included on purpose: an admin lines
 * up someone's project while the invite is out, so the work is waiting the
 * moment they accept instead of needing a second trip back to an admin. They
 * gain nothing early — the backend admits only ACTIVE workspace members to any
 * workspace route, so the invite stays the only gate.
 *
 * Rows with no `user_id` are dropped. The members list renders email
 * invitations (no account yet) in the same shape as members, and there is no
 * user for a project row to point at until they sign up.
 */
export function projectMemberCandidates(
  workspaceMembers: IWorkspaceMember[],
  alreadyOnProject: ReadonlySet<string>,
): IMemberCandidate[] {
  const candidates = workspaceMembers.flatMap((m) =>
    m.user_id && !alreadyOnProject.has(m.user_id)
      ? [
          {
            user_id: m.user_id,
            display_name: m.display_name,
            email: m.email,
            avatar_url: m.avatar_url,
            invited: m.status === EMemberStatus.Pending,
          },
        ]
      : [],
  );
  // Active first: the common pick shouldn't sit below a list of people who
  // cannot open the project yet.
  return candidates.sort((a, b) => Number(a.invited) - Number(b.invited));
}
