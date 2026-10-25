import { ProjectGeneralSettings, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectGeneralSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="General"
      description="Name, identifier, schedule, and Sprint-0 options for this project."
    >
      <ProjectGeneralSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
