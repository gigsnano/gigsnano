import { IntakeWizard } from "@/components/package-import/intake-wizard";
import { ProjectSettingsPageShell } from "@/components/settings";
import { SolutionContainerGate } from "@/components/solutions/solution-container-gate";

/** GIN-400. Named `document-import`, not `intake`: `/intake` is already the
 *  customer-request triage queue (GIN-214). Lives under project settings since
 *  the Rail B drill-in (setup, not daily work). */
export default async function ProjectDocumentImportSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <SolutionContainerGate segment="document-import">
      <ProjectSettingsPageShell
        width="wide"
        title="Import project documents"
        description="Turn a delivery package someone already wrote — specs, design system, implementation phases — into work you can execute, without redoing the discovery."
      >
        <IntakeWizard workspaceSlug={workspaceSlug} projectId={projectId} />
      </ProjectSettingsPageShell>
    </SolutionContainerGate>
  );
}
