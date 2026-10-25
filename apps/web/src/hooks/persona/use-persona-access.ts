import { useAuthUser } from "@/hooks/auth/use-auth";
import { useMembers } from "@/hooks/workspace/use-members";
import {
  PERSONA_CONFIG,
  PERSONA_ORDER,
  personaAllowed,
  type EPersonaRole,
} from "@/lib/persona/persona-config";
import type { EWorkspaceRole } from "@/types";

/**
 * Which persona lenses the current member may see, from their workspace role.
 * Gated lenses (e.g. Manager = Admin+) are hidden and deep-links to them bounce
 * (enforced in the shell), so RBAC holds on navigation, not just display.
 */
export function usePersonaAccess(workspaceSlug: string) {
  const { data: user } = useAuthUser();
  const { data: members } = useMembers(workspaceSlug);

  const workspaceRole: EWorkspaceRole | null =
    members?.find((m) => m.user_id === user?.id)?.role ?? null;

  const allowedRoles: EPersonaRole[] = PERSONA_ORDER.filter((r) =>
    personaAllowed(PERSONA_CONFIG[r], workspaceRole),
  );

  return {
    workspaceRole,
    allowedRoles,
    isLoading: user === undefined || members === undefined,
    isAllowed: (role: EPersonaRole) => allowedRoles.includes(role),
  };
}
