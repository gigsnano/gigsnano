import { ProjectStatesSettings, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectStatesSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="States"
      description="Customize workflow states and how they group on boards."
    >
      <ProjectStatesSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
