"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";

import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useTimeEntries,
} from "@/hooks/story/use-story-detail";

/** "2.5h" / "3h" */
const fmtHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0+$/, "")}h`;

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const mins = Math.floor(secs / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function IssueTimeTracking({
  storyId,
  workspaceSlug,
  projectId,
}: {
  storyId: string;
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: entries } = useTimeEntries(workspaceSlug, projectId, storyId);
  const create = useCreateTimeEntry(workspaceSlug, projectId, storyId);
  const remove = useDeleteTimeEntry(workspaceSlug, projectId, storyId);

  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  const total = (entries ?? []).reduce((sum, e) => sum + e.hours, 0);
  const parsed = Number(hours);
  const valid = hours.trim() !== "" && parsed > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    create
      .mutateAsync({ hours: parsed, note: note.trim() })
      .then(() => {
        setHours("");
        setNote("");
      })
      .catch(() => {});
  };

  return (
    <IssueCollapsibleSection
      title="Time tracking"
      count={entries?.length ?? 0}
      defaultOpen
      action={
        total > 0 ? (
          <span className="text-xs font-medium text-muted-foreground">
            {fmtHours(total)} total
          </span>
        ) : null
      }
    >
      <form onSubmit={submit} className="mb-2 flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="Hours"
          aria-label="Hours"
          className="w-20 rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you work on? (optional)"
          aria-label="Note"
          className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <Button type="submit" size="sm" disabled={!valid || create.isPending}>
          {create.isPending ? "Logging…" : "Log"}
        </Button>
      </form>

      {(entries?.length ?? 0) === 0 ? (
        <p className="px-1 py-1.5 text-xs text-muted-foreground">
          No hours logged yet. Add your first entry above.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {(entries ?? []).map((entry) => (
            <li
              key={entry.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-accent/50"
            >
              <span className="w-12 shrink-0 text-sm font-medium tabular-nums">
                {fmtHours(entry.hours)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {entry.note || <span className="text-muted-foreground">No note</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.user_name} · {timeAgo(entry.created_at)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Delete time entry"
                onClick={() => remove.mutate(entry.id)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 active:scale-[0.97]"
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </IssueCollapsibleSection>
  );
}
