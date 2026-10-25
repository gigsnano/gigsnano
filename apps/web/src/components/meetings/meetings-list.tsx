"use client";

import { useState } from "react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useMeetings } from "@/hooks/meetings/use-meetings";
import { relativeTime } from "@/lib/format/relative-time";

import { MeetingStatusPill } from "./meeting-status-pill";
import { PlatformIcon } from "./platform-icon";
import { SendNotetakerDialog } from "./send-notetaker-dialog";

export function MeetingsList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useMeetings(workspaceSlug, projectId);
  const [sendOpen, setSendOpen] = useState(false);
  const base = `/${workspaceSlug}/projects/${projectId}/meetings`;

  if (isPending) {
    return (
      <SkeletonReveal
        isLoading
        className="m-6 min-h-48"
        skeleton={<div className="size-full rounded-lg border bg-muted" />}
      >
        <div />
      </SkeletonReveal>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load meetings"
          description="Something went wrong."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="generic"
          title="No meetings yet"
          description="Send GigsNano Notetaker into a Google Meet, Teams or Zoom call to capture a live transcript and turn action items into work."
          actions={[{ label: "Send notetaker", onClick: () => setSendOpen(true) }]}
        />
        <SendNotetakerDialog
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          open={sendOpen}
          onOpenChange={setSendOpen}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">
        {items.length} meeting{items.length === 1 ? "" : "s"}
      </h2>
      <ul className="divide-y rounded-lg border">
        {items.map((meeting) => (
          <li key={meeting.id} className="transition-colors hover:bg-accent/40">
            <Link href={`${base}/${meeting.id}`} className="flex items-center gap-3 px-4 py-3">
              <PlatformIcon platform={meeting.platform} />
              <span className="min-w-0 flex-1 truncate font-medium">{meeting.title}</span>
              {/* Trailing cluster: `shrink-0` keeps status/count readable instead of
                  squashing, and the relative time is the least essential of the
                  three, so it's the one that drops below `sm` (~400px). */}
              <span className="flex shrink-0 items-center gap-2">
                <MeetingStatusPill status={meeting.status} />
                {meeting.pending_action_items > 0 ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {meeting.pending_action_items} to review
                  </span>
                ) : null}
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {relativeTime(meeting.started_at ?? meeting.created_at)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
