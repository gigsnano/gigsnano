import { ProjectViewDetail } from "@/components/views/project-view-detail";

export default async function ProjectViewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; viewId: string }>;
}) {
  const { workspaceSlug, projectId, viewId } = await params;

  return <ProjectViewDetail workspaceSlug={workspaceSlug} projectId={projectId} viewId={viewId} />;
}
