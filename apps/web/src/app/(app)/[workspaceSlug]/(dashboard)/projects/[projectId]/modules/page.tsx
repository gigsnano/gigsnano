import { ModulesList } from "@/components/modules/modules-list";

export default async function ProjectModulesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return <ModulesList workspaceSlug={workspaceSlug} projectId={projectId} />;
}
