import { useAuthUser } from "@/hooks/auth/use-auth";
import { useMembers } from "@/hooks/workspace/use-members";
import { EMemberStatus, EWorkspaceRole } from "@/types";

/** True when the signed-in user is an active workspace admin or owner. */
export function useWorkspaceAdmin(workspaceSlug: string) {
  const { data: user } = useAuthUser();
  const members = useMembers(workspaceSlug);
  const me = members.data?.find(
    (m) => m.user_id === user?.id && m.status === EMemberStatus.Active,
  );
  const isAdmin =
    me?.role === EWorkspaceRole.Admin || me?.role === EWorkspaceRole.Owner;
  return { isAdmin: Boolean(isAdmin), isPending: members.isPending };
}
