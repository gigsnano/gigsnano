import { TopologyBuilder } from "@/components/journey/topology/topology-builder";

export default async function ProjectTopologyPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; stepId: string }>;
}) {
  const { workspaceSlug, projectId, stepId } = await params;

  return <TopologyBuilder workspaceSlug={workspaceSlug} projectId={projectId} stepId={stepId} />;
}
