import { FoundationView } from "@/components/foundation/foundation-view";
import { SolutionContainerGate } from "@/components/solutions/solution-container-gate";

/** FoundationView owns its heading + page width, so it skips ProjectSettingsPageShell. */
export default async function ProjectFoundationSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <SolutionContainerGate segment="foundation">
      <FoundationView workspaceSlug={workspaceSlug} projectId={projectId} />
    </SolutionContainerGate>
  );
}
