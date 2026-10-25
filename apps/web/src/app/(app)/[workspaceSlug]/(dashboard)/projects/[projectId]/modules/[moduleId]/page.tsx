import { ModuleDetail } from "@/components/modules/module-detail";

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; moduleId: string }>;
}) {
  const { workspaceSlug, projectId, moduleId } = await params;

  return <ModuleDetail workspaceSlug={workspaceSlug} projectId={projectId} moduleId={moduleId} />;
}
