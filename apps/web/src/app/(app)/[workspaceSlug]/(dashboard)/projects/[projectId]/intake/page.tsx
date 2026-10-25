import { ProjectIntakeList } from "@/components/issues/project-intake-list";

export default async function ProjectIntakePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return <ProjectIntakeList workspaceSlug={workspaceSlug} projectId={projectId} />;
}
