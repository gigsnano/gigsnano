import { DiscoveryJourney } from "@/components/journey/discovery/discovery-journey";

export default async function ProjectDiscoveryPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return <DiscoveryJourney workspaceSlug={workspaceSlug} projectId={projectId} />;
}
