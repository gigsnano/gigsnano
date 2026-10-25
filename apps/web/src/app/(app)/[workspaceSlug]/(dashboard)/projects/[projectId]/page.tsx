import { ProjectOverview } from "@/components/projects/project-overview";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return <ProjectOverview workspaceSlug={workspaceSlug} projectId={projectId} />;
}
