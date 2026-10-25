import { ProjectSettingsHub } from "@/components/projects/project-settings-hub";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  return <ProjectSettingsHub workspaceSlug={workspaceSlug} projectId={projectId} />;
}
