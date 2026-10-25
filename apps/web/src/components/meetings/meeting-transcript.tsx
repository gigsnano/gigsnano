"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { useMeetingTranscript } from "@/hooks/meetings/use-meetings";
import { useStickToBottom } from "@/hooks/ui/use-stick-to-bottom";
import { formatOffset, groupBySpeaker, type IMeetingSpeakerGroup } from "@/lib/meetings/transcript";
import { isLiveMeetingStatus } from "@/lib/meetings/meeting-status";
import { cn } from "@/lib/utils";
import { EMeetingStatus } from "@/types";

/** Deterministic text tint per speaker (same hash recipe as `Avatar`'s tint,
 * kept local since only the text color is needed here, not a filled chip). */
const SPEAKER_TINTS = [
  "text-rose-600 dark:text-rose-300",
  "text-sky-600 dark:text-sky-300",
  "text-emerald-600 dark:text-emerald-300",
  "text-violet-600 dark:text-violet-300",
  "text-amber-600 dark:text-amber-300",
  "text-cyan-600 dark:text-cyan-300",
];

function tintFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return SPEAKER_TINTS[h % SPEAKER_TINTS.length];
}

export function MeetingTranscript({
  workspaceSlug,
  projectId,
  meetingId,
  status,
}: {
  workspaceSlug: string;
  projectId: string;
  meetingId: string;
  status: EMeetingStatus;
}) {
  const live = isLiveMeetingStatus(status);
  const { data, isPending, isError } = useMeetingTranscript(
    workspaceSlug,
    projectId,
    meetingId,
    live,
  );
  const segments = data ?? [];
  const groups = groupBySpeaker(segments);
  const { ref, atBottom, scrollToBottom } = useStickToBottom<HTMLDivElement>(segments.length);

  if (isPending) {
    return (
      <div className="flex-1 space-y-3 overflow-hidden p-4 sm:p-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3.5 w-24 rounded bg-muted" />
            <div className="h-3.5 w-3/4 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="flex-1 p-6 text-sm text-muted-foreground">Couldn&apos;t load the transcript.</p>
    );
  }

  if (groups.length === 0) {
    return live ? (
      <p className="flex-1 px-6 py-12 text-center text-sm text-muted-foreground">
        Listening… the transcript appears here as people speak.
      </p>
    ) : (
      <EmptyState
        assetKey="search-empty"
        title="No transcript was captured"
        className="flex-1"
      />
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={ref}
        tabIndex={0}
        aria-label="Meeting transcript"
        className="h-full space-y-4 overflow-y-auto p-4 sm:p-6"
      >
        {groups.map((group) => (
          <SpeakerGroup key={group.key} group={group} />
        ))}
      </div>

      {!atBottom && live ? (
        <button
          type="button"
          onClick={scrollToBottom}
          className="gn-meeting-jump-pill absolute bottom-4 left-1/2 flex items-center gap-1.5 rounded-full border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-md active:scale-[0.97]"
        >
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" aria-hidden />
          Jump to live
        </button>
      ) : null}
    </div>
  );
}

function SpeakerGroup({ group }: { group: IMeetingSpeakerGroup }) {
  return (
    <div className="gn-meeting-group">
      <div className="flex items-baseline gap-2">
        <span className={cn("text-sm font-semibold", tintFor(group.speaker))}>
          {group.speaker}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatOffset(group.start_ms)}
        </span>
      </div>
      <div className="mt-0.5 space-y-1">
        {group.segments.map((segment) => (
          <p key={segment.seq} className="text-sm leading-relaxed text-foreground/90">
            {segment.text}
          </p>
        ))}
      </div>
    </div>
  );
}
