import { TeamspaceOverview } from "@/components/teamspaces/teamspace-overview";

export default async function TeamspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; teamspaceId: string }>;
}) {
  const { workspaceSlug, teamspaceId } = await params;

  return <TeamspaceOverview workspaceSlug={workspaceSlug} teamspaceId={teamspaceId} />;
}
