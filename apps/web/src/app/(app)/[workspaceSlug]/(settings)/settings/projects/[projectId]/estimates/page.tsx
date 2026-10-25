import { ProjectEstimatesSettings, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectEstimatesSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="Estimates"
      description="Configure how work is estimated in this project."
    >
      <ProjectEstimatesSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
