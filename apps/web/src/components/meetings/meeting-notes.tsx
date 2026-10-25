"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { RefreshIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShimmerText } from "@/components/ui/shimmer-text";
import {
  useApproveActionItems,
  useMeetingActionItems,
  useRegenerateMeetingNotes,
} from "@/hooks/meetings/use-meetings";
import { useProjectMembers } from "@/hooks/project/use-project-members";
import { renderSimpleMarkdown } from "@/lib/docs/markdown";
import type { IMeeting } from "@/types";

import { ActionItemCard } from "./action-item-card";

/**
 * The panel already labels this section "Summary" via its own `<h2>` — strip
 * a redundant leading markdown heading with that exact text (any level,
 * case-insensitive) so the word doesn't render twice.
 */
function stripLeadingSummaryHeading(markdown: string): string {
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const heading = lines[i]?.match(/^#{1,6}\s+(.*)$/);
  if (heading && heading[1].trim().toLowerCase() === "summary") {
    lines.splice(i, 1);
    return lines.join("\n").replace(/^\s+/, "");
  }
  return markdown;
}

/**
 * The F4 right rail: `notes_status`-driven summary + action-item approval
 * list. Mounted only once the meeting has ended (see `meeting-view.tsx`).
 */
export function MeetingNotes({
  workspaceSlug,
  projectId,
  meetingId,
  meeting,
}: {
  workspaceSlug: string;
  projectId: string;
  meetingId: string;
  meeting: IMeeting;
}) {
  const notesStatus = meeting.notes_status;
  const regenerate = useRegenerateMeetingNotes(workspaceSlug, projectId, meetingId);

  // `null` covers the brief instant before the backend's sync loop has picked
  // the ended meeting up — same treatment as an explicit "pending".
  if (notesStatus == null || notesStatus === "pending") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <ShimmerText text="Writing summary and action items…" className="text-sm font-medium" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (notesStatus === "failed") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t write the notes for this meeting.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={regenerate.isPending}
          onClick={() => regenerate.mutate()}
          aria-label="Retry writing the summary and action items"
        >
          {regenerate.isPending ? "Retrying…" : "Try again"}
        </Button>
      </div>
    );
  }

  if (notesStatus === "empty") {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Nothing to summarise — the transcript was empty.
        </p>
      </div>
    );
  }

  return (
    <ReadyNotes
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      meetingId={meetingId}
      meeting={meeting}
    />
  );
}

function ReadyNotes({
  workspaceSlug,
  projectId,
  meetingId,
  meeting,
}: {
  workspaceSlug: string;
  projectId: string;
  meetingId: string;
  meeting: IMeeting;
}) {
  const { data: members } = useProjectMembers(workspaceSlug, projectId);
  const { data: items, isPending } = useMeetingActionItems(
    workspaceSlug,
    projectId,
    meetingId,
    true,
  );
  const regenerate = useRegenerateMeetingNotes(workspaceSlug, projectId, meetingId);
  const approveAll = useApproveActionItems(workspaceSlug, projectId, meetingId);

  const list = items ?? [];
  const pending = list.filter((i) => i.status === "pending");

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
      <section aria-labelledby="meeting-summary-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="meeting-summary-heading" className="text-sm font-semibold">
            Summary
          </h2>
          <button
            type="button"
            aria-label="Regenerate summary and action items"
            title="Regenerating replaces any items you haven't approved or dismissed yet."
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate()}
            className="flex items-center gap-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline disabled:opacity-50"
          >
            <HugeiconsIcon icon={RefreshIcon} className="size-3.5" aria-hidden />
            {regenerate.isPending ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
        {meeting.summary ? (
          <div
            className="mt-2 text-sm text-foreground/90"
            dangerouslySetInnerHTML={{
              __html: renderSimpleMarkdown(stripLeadingSummaryHeading(meeting.summary)),
            }}
          />
        ) : null}
      </section>

      <section aria-labelledby="action-items-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="action-items-heading" className="text-sm font-semibold">
            Action items
          </h2>
          {pending.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{pending.length} to review</span>
              <Button
                type="button"
                size="sm"
                disabled={approveAll.isPending}
                onClick={() => approveAll.mutate(pending.map((i) => i.id))}
                aria-label="Approve all pending action items"
              >
                {approveAll.isPending ? "Approving…" : "Approve all"}
              </Button>
            </div>
          ) : null}
        </div>

        {isPending ? (
          <div className="mt-3 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No action items were found in this meeting.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {list.map((item) => (
              <ActionItemCard
                key={item.id}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                meetingId={meetingId}
                item={item}
                members={members ?? []}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
