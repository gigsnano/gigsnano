import { ProjectSettingsPageShell } from "@/components/settings";
import { AutomationComposer } from "@/components/settings/automation/automation-composer";

export default async function ProjectAutomationRulesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="Automations"
      description="Compose automations in plain language, preview the compiled rule, and review run history."
    >
      <AutomationComposer workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
