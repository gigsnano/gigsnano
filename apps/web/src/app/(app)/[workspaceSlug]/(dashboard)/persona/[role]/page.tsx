import { PersonaShell } from "@/components/persona/persona-shell";
import { PersonaIndexRedirect } from "@/components/persona/persona-index-redirect";
import { isPersonaRole } from "@/lib/persona/persona-config";

export default async function PersonaRoleRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; role: string }>;
}) {
  const { workspaceSlug, role } = await params;

  if (!isPersonaRole(role)) {
    return <PersonaIndexRedirect workspaceSlug={workspaceSlug} />;
  }

  return <PersonaShell workspaceSlug={workspaceSlug} role={role} />;
}
