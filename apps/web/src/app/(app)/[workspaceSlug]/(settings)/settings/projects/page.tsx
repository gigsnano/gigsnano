import { ProjectSettingsList, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectSettingsIndexPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return (
    <ProjectSettingsPageShell
      title="Projects"
      description="Configure features, labels, workflow states, and members per project."
    >
      <ProjectSettingsList workspaceSlug={workspaceSlug} />
    </ProjectSettingsPageShell>
  );
}
