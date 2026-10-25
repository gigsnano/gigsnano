import { useAuthUser } from "@/hooks/auth/use-auth";
import { useMembers } from "@/hooks/workspace/use-members";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { canProject, type EProjectPermission } from "@/lib/project-rbac";
import { workspaceRoleOf } from "@/lib/workspace/workspace-role";
import { EMemberStatus, type EProjectRole, type EWorkspaceRole } from "@/types";

/**
 * The signed-in user's effective project permissions (GIN-318/321). Drives which
 * controls the UI offers; the server remains the authority. `can()` mirrors the
 * backend matrix and honours the workspace Owner/Admin governance override.
 */
export function useProjectPermissions(workspaceSlug: string, projectId: string) {
  const { data: user } = useAuthUser();
  const { data: wsMembers, isPending: wsPending } = useMembers(workspaceSlug);
  const { data: projMembers, isPending: projPending } = useProjectMembers(workspaceSlug, projectId);

  const workspaceRole: EWorkspaceRole | null = workspaceRoleOf(wsMembers, user?.id);
  const projectRole: EProjectRole | null =
    projMembers?.find((m) => m.user_id === user?.id && m.status === EMemberStatus.Active)?.role ??
    null;

  return {
    userId: user?.id ?? null,
    workspaceRole,
    projectRole,
    isPending: wsPending || projPending,
    can: (permission: EProjectPermission) => canProject(workspaceRole, projectRole, permission),
  };
}
