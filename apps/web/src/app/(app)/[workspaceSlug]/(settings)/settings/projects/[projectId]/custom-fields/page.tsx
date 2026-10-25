import { CustomFieldsSettings, ProjectSettingsPageShell } from "@/components/settings";

export default async function ProjectCustomFieldsSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="Custom fields"
      description="Define extra structured fields your team can set on stories in this project."
    >
      <CustomFieldsSettings workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
