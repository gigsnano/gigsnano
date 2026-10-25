import { ProjectFeaturesSettings, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectFeaturesSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="Features"
      description="Enable or disable project modules like cycles, modules, and views."
    >
      <ProjectFeaturesSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
