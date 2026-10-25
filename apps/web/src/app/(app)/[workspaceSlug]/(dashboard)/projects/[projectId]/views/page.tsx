import { ProjectViewsList } from "@/components/views/project-views-list";

export default async function ProjectViewsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return <ProjectViewsList workspaceSlug={workspaceSlug} projectId={projectId} />;
}
