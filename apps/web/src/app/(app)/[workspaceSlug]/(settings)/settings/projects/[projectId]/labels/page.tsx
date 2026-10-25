import { ProjectLabelsSettings, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectLabelsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="Labels"
      description="Color-coded labels for categorizing stories."
    >
      <ProjectLabelsSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
