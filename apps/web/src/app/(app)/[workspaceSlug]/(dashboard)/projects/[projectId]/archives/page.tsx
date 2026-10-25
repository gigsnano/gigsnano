import { ProjectArchivesList } from "@/components/issues/project-archives-list";

export default async function ProjectArchivesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return <ProjectArchivesList workspaceSlug={workspaceSlug} projectId={projectId} />;
}
