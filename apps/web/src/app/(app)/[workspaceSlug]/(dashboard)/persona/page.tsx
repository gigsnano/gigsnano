import { PersonaIndexRedirect } from "@/components/persona/persona-index-redirect";

export default async function PersonaIndexRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <PersonaIndexRedirect workspaceSlug={workspaceSlug} />;
}
