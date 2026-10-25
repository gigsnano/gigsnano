import { CycleDetailView } from "@/components/cycles/cycle-detail-view";

export default async function CycleDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; cycleId: string }>;
}) {
  const { workspaceSlug, projectId, cycleId } = await params;

  return (
    <CycleDetailView workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />
  );
}
