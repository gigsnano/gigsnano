import { CyclesView } from "@/components/cycles/cycles-view";

export default async function ProjectCyclesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return <CyclesView workspaceSlug={workspaceSlug} projectId={projectId} />;
}
