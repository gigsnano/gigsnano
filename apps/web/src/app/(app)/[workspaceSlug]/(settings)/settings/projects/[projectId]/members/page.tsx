import { ProjectMembersSettings, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectMembersSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="Members"
      description="Manage who has access to this project and their roles."
    >
      <ProjectMembersSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
