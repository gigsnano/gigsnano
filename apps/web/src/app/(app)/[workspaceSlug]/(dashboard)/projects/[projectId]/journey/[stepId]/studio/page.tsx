import { ExperienceStudio } from "@/components/journey/experience/experience-studio";

export default async function ExperienceStudioPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; stepId: string }>;
}) {
  const { workspaceSlug, projectId, stepId } = await params;

  return (
    <ExperienceStudio
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      stepId={stepId}
      approver="You"
    />
  );
}
