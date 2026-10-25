import { RoadmapPage } from "@/components/roadmap/roadmap-page";

export default async function RoadmapRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  return <RoadmapPage workspaceSlug={workspaceSlug} />;
}
