import { AppHeader, ContentWrapper } from "@/components/layout";
import { AgentCallScreen } from "@/components/agents/agent-call-screen";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; agentId: string }>;
}) {
  const { workspaceSlug, agentId } = await params;

  return (
    <>
      <AppHeader />
      <ContentWrapper>
        <AgentCallScreen workspaceSlug={workspaceSlug} agentId={agentId} />
      </ContentWrapper>
    </>
  );
}
