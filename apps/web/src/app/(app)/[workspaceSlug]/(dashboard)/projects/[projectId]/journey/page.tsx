import { JourneyPage } from "@/components/journey";

export default async function ProjectJourneyPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return <JourneyPage workspaceSlug={workspaceSlug} projectId={projectId} />;
}
