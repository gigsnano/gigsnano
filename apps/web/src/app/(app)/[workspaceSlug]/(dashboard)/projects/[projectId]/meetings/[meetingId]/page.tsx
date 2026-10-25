import { ContentWrapper } from "@/components/layout";
import { MeetingView } from "@/components/meetings/meeting-view";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; meetingId: string }>;
}) {
  const { workspaceSlug, projectId, meetingId } = await params;

  return (
    // `overflow-hidden` hands scroll control to MeetingView, which pins its
    // header/status bar and lets only the transcript region scroll — the
    // same override the inbox master-detail view uses for the same reason.
    <ContentWrapper className="overflow-hidden">
      <MeetingView workspaceSlug={workspaceSlug} projectId={projectId} meetingId={meetingId} />
    </ContentWrapper>
  );
}
