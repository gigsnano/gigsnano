import { AgentWorkspacePage } from "@/components/journey/workspace/agent-workspace-page";

export default async function ProjectJourneyStepPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; stepId: string }>;
}) {
  const { workspaceSlug, projectId, stepId } = await params;

  return <AgentWorkspacePage workspaceSlug={workspaceSlug} projectId={projectId} stepId={stepId} />;
}
