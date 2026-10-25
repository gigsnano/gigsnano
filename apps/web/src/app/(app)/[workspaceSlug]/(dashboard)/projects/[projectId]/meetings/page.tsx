import { ContentWrapper } from "@/components/layout";
import { MeetingsList } from "@/components/meetings/meetings-list";

export default async function ProjectMeetingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <ContentWrapper>
      <MeetingsList workspaceSlug={workspaceSlug} projectId={projectId} />
    </ContentWrapper>
  );
}
