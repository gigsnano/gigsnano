import { ProjectGitHubFiles } from "@/components/projects/github";
import { ProjectSettingsPageShell } from "@/components/settings";
import { SolutionContainerGate } from "@/components/solutions/solution-container-gate";

export default async function ProjectRepositorySettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <SolutionContainerGate segment="repository">
      <ProjectSettingsPageShell
        width="wide"
        title="Repository"
        description="Browse the GitHub repository connected to this project."
      >
        <ProjectGitHubFiles workspaceSlug={workspaceSlug} projectId={projectId} />
      </ProjectSettingsPageShell>
    </SolutionContainerGate>
  );
}
