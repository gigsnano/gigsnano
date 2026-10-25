import { ProjectAutomationsSettings, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectAutomationsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="Automations"
      description="Rules that run when events happen in this project."
    >
      <ProjectAutomationsSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
