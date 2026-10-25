import { ProjectSettingsPageShell } from "@/components/settings";
import { WorkflowBuilder } from "@/components/settings/workflow/workflow-builder";

export default async function ProjectWorkflowSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ProjectSettingsPageShell
      title="Workflow"
      description="Define gated status transitions and who approves them — a human role or an AI persona."
    >
      <WorkflowBuilder workspaceSlug={workspaceSlug} projectId={projectId} />
    </ProjectSettingsPageShell>
  );
}
