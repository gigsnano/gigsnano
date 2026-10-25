import { useAuthUser } from "@/hooks/auth/use-auth";
import { useMembers } from "@/hooks/workspace/use-members";
import { isWorkspaceAdmin, workspaceRoleOf } from "@/lib/workspace/workspace-role";

/**
 * The signed-in user's workspace role and whether it carries admin authority.
 *
 * Every workspace-admin write — member invite/re-role/remove, and all of billing
 * — is `require_role(ADMIN, OWNER)` on the server. Screens read `isAdmin` to
 * decide whether to render the control at all, rather than rendering it and
 * surfacing the 403 as a generic "please try again".
 */
export function useWorkspaceRole(workspaceSlug: string) {
  const { data: user } = useAuthUser();
  const { data: members, isPending } = useMembers(workspaceSlug);
  const role = workspaceRoleOf(members, user?.id);
  return { role, isAdmin: isWorkspaceAdmin(role), isPending };
}
