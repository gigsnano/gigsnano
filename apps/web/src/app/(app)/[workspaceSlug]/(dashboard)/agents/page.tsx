import { AgentContactList } from "@/components/agents/agent-contact-list";

export default async function AgentsRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <AgentContactList workspaceSlug={workspaceSlug} />;
}
