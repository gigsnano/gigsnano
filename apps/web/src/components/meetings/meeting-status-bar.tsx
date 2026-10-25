"use client";

import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon, Loading03Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { useCreateMeeting } from "@/hooks/meetings/use-meetings";
import { MEETING_STEPS, isLiveMeetingStatus, meetingStepIndex } from "@/lib/meetings/meeting-status";
import { cn } from "@/lib/utils";
import { EMeetingStatus, type IMeeting } from "@/types";

/**
 * 4-step Joining → Waiting for host → Transcribing → Ended stepper. Fixed
 * height (`h-16`) regardless of which sub-state is showing, so the header
 * below never shifts as the meeting progresses. `failed` swaps the whole
 * stepper for a destructive row instead of trying to place it on a step —
 * the provider doesn't tell us which step it failed at.
 */
export function MeetingStatusBar({
  workspaceSlug,
  projectId,
  meeting,
}: {
  workspaceSlug: string;
  projectId: string;
  meeting: IMeeting;
}) {
  if (meeting.status === EMeetingStatus.Failed) {
    return (
      <FailedRow
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        meetingUrl={meeting.meeting_url}
        meetingTitle={meeting.title}
        reason={meeting.failure_reason}
      />
    );
  }

  // `Failed` already returned above, so `live` here is exactly "not Ended".
  const activeIndex = meetingStepIndex(meeting.status);
  const live = isLiveMeetingStatus(meeting.status);

  return (
    <div className="flex h-16 shrink-0 flex-col justify-center gap-1.5 border-b px-4 sm:px-6">
      <ol className="flex items-center">
        {MEETING_STEPS.map((label, index) => {
          // While live, only steps strictly before the current one are done and
          // the current one is mid-progress (spinner/live-dot). Once Ended,
          // `activeIndex` points at the last step itself (index 3) — every step
          // up to and including it reads as complete, and none is "active"
          // (nothing is still in progress on a finished meeting).
          const isComplete = live ? index < activeIndex : index <= activeIndex;
          const isActive = live && index === activeIndex;
          const isLast = index === MEETING_STEPS.length - 1;
          const isLiveDot = isActive && label === "Transcribing";

          return (
            <li
              key={label}
              aria-current={isActive ? "step" : undefined}
              className={cn("flex items-center", !isLast && "flex-1")}
            >
              <span className="flex shrink-0 items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-medium transition-colors duration-150 ease-out",
                    isComplete && "border-transparent bg-primary text-primary-foreground",
                    isActive && !isLiveDot && "border-primary text-primary",
                    isActive && isLiveDot && "border-emerald-500 text-emerald-600 dark:text-emerald-400",
                    !isComplete && !isActive && "border-border text-muted-foreground",
                  )}
                >
                  {isComplete ? (
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" />
                  ) : isLiveDot ? (
                    <span className="size-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                  ) : isActive ? (
                    <HugeiconsIcon icon={Loading03Icon} className="size-3 motion-safe:animate-spin" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium whitespace-nowrap",
                    isActive || isComplete ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </span>
              {!isLast ? (
                <span className="mx-2.5 h-px flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className={cn(
                      "block h-full origin-left scale-x-0 bg-primary transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none",
                      isComplete && "scale-x-100",
                    )}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Fixed-height hint row (opacity toggle, not conditional mount) so the
          admission hint never shifts the layout when it appears/disappears. */}
      <p
        className={cn(
          "h-4 text-xs text-muted-foreground transition-opacity duration-150 ease-out motion-reduce:transition-none",
          meeting.status === EMeetingStatus.WaitingAdmission ? "opacity-100" : "opacity-0",
        )}
      >
        Ask the host to admit GigsNano Notetaker.
      </p>
    </div>
  );
}

function FailedRow({
  workspaceSlug,
  projectId,
  meetingUrl,
  meetingTitle,
  reason,
}: {
  workspaceSlug: string;
  projectId: string;
  meetingUrl: string;
  meetingTitle: string;
  reason: string | null;
}) {
  const router = useRouter();
  const create = useCreateMeeting(workspaceSlug, projectId);

  const onRetry = async () => {
    try {
      // Consent was already affirmed when this meeting was first sent —
      // re-sending the same link doesn't ask again. Re-send the title too, so
      // a retry doesn't fall back to the generic "<Platform> meeting" default.
      const meeting = await create.mutateAsync({
        meeting_url: meetingUrl,
        title: meetingTitle,
        consent_acknowledged: true,
      });
      router.push(`/${workspaceSlug}/projects/${projectId}/meetings/${meeting.id}`);
    } catch {
      // The button's own pending state already reverts; nothing else to do
      // here without a toast lib. A stuck "failed" screen is still honest.
    }
  };

  return (
    <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-destructive/5 px-4 sm:px-6">
      <span className="flex min-w-0 items-center gap-2 text-sm text-destructive">
        <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
        <span className="truncate">{reason ?? "The notetaker couldn't join."}</span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={create.isPending}
        onClick={onRetry}
        className="shrink-0 active:scale-[0.97]"
      >
        {create.isPending ? "Retrying…" : "Try again"}
      </Button>
    </div>
  );
}
