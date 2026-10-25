"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, StopCircleIcon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useMeeting, useStopMeeting } from "@/hooks/meetings/use-meetings";
import { isLiveMeetingStatus } from "@/lib/meetings/meeting-status";
import { cn } from "@/lib/utils";
import { EMeetingStatus } from "@/types";

import { MeetingNotes } from "./meeting-notes";
import { MeetingStatusBar } from "./meeting-status-bar";
import { MeetingStatusPill } from "./meeting-status-pill";
import { MeetingTranscript } from "./meeting-transcript";
import { PlatformIcon } from "./platform-icon";

/**
 * The live meeting page: header (platform/title/status/actions) → the 4-step
 * status bar → transcript, with the F4 notes panel slotted in once the
 * meeting has ended. Owns its own inner scroll (like the inbox master-detail
 * view) so the header and status bar stay pinned while only the transcript
 * scrolls — `page.tsx` passes `overflow-hidden` into `ContentWrapper` to hand
 * that control over.
 */
export function MeetingView({
  workspaceSlug,
  projectId,
  meetingId,
}: {
  workspaceSlug: string;
  projectId: string;
  meetingId: string;
}) {
  const {
    data: meeting,
    isPending,
    isError,
    refetch,
  } = useMeeting(workspaceSlug, projectId, meetingId);
  const stop = useStopMeeting(workspaceSlug, projectId, meetingId);

  if (isPending) {
    return (
      <SkeletonReveal
        isLoading
        className="h-full overflow-y-auto"
        skeleton={<div className="m-6 min-h-48 rounded-lg border bg-muted" />}
      >
        <div />
      </SkeletonReveal>
    );
  }

  if (isError || !meeting) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load meeting"
          description="Something went wrong."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const live = isLiveMeetingStatus(meeting.status);
  const ended = meeting.status === EMeetingStatus.Ended;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <PlatformIcon platform={meeting.platform} />
          <span className="min-w-0 truncate font-medium">{meeting.title}</span>
          <MeetingStatusPill status={meeting.status} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={meeting.meeting_url} target="_blank" rel="noreferrer">
              <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
              Open meeting
            </a>
          </Button>
          {live ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={stop.isPending}
              onClick={() => stop.mutate()}
              className="active:scale-[0.97]"
            >
              <HugeiconsIcon icon={StopCircleIcon} className="size-4" />
              {stop.isPending ? "Stopping…" : "Stop notetaker"}
            </Button>
          ) : null}
        </div>
      </div>

      {stop.isError ? (
        <p role="alert" className="px-6 pb-2 text-xs text-destructive">
          Couldn’t stop the notetaker. Try again in a moment.
        </p>
      ) : null}

      <MeetingStatusBar workspaceSlug={workspaceSlug} projectId={projectId} meeting={meeting} />

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          // Notes only exist once the meeting has ended (F4 fills the slot) —
          // reserving the 420px rail before then would waste half the screen
          // on an empty section.
          ended && "lg:grid lg:grid-cols-[minmax(0,1fr)_420px]",
        )}
      >
        <MeetingTranscript
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          meetingId={meetingId}
          status={meeting.status}
        />
        {ended ? (
          <section
            aria-label="Meeting notes"
            className="flex min-h-0 flex-col border-t lg:border-t-0 lg:border-l"
          >
            <MeetingNotes
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              meetingId={meetingId}
              meeting={meeting}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
