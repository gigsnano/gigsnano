"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, RefreshIcon, Delete02Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { PriorityGlyph } from "@/components/issues/shared/priority-glyph";
import { TypeGlyph } from "@/components/issues/shared/type-glyph";
import { StoryCode } from "@/components/issues/shared/story-code";
import { useTrash, useRestoreStory, usePurgeStory } from "@/hooks/story/use-trash";
import { relativeTime } from "@/lib/format/relative-time";
import { storyTypeOf } from "@/lib/issues/story-type";
import type { ITrashedStory } from "@/types";

export function TrashList({ workspaceSlug }: { workspaceSlug: string }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  // Debounce the search term so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isPending, isError, refetch } = useTrash(workspaceSlug, { q: q || undefined });
  const restore = useRestoreStory(workspaceSlug);
  const purge = usePurgeStory(workspaceSlug);
  const [purgeTarget, setPurgeTarget] = useState<ITrashedStory | null>(null);

  const items = data?.items ?? [];

  return (
    <section className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold">Trash</h1>
          {data ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
              {data.total}
            </span>
          ) : null}
        </div>
        <div className="relative w-full max-w-xs">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search trash"
            aria-label="Search trash"
            className="pl-8"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Deleted work items are kept here indefinitely. Restore them, or delete them permanently.
      </p>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonReveal
              key={i}
              isLoading
              className="h-16"
              skeleton={<div className="size-full rounded-lg border bg-card" />}
            >
              <div />
            </SkeletonReveal>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          assetKey="error"
          title="Couldn't load trash"
          description="Something went wrong fetching deleted work items."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      ) : items.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title={q ? "No matching items in Trash" : "Trash is empty"}
          description={
            q
              ? "No deleted work items match your search."
              : "Work items you delete are moved here so you can restore them later."
          }
          actions={q ? undefined : [{ label: "Browse projects", href: `/${workspaceSlug}/projects` }]}
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((story) => (
            <TrashRow
              key={story.id}
              story={story}
              restoring={restore.isPending && restore.variables?.storyId === story.id}
              onRestore={() => restore.mutate({ projectId: story.project_id, storyId: story.id })}
              onPurge={() => setPurgeTarget(story)}
            />
          ))}
        </ul>
      )}

      <Dialog open={purgeTarget !== null} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete permanently?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">
                {purgeTarget?.title || "This work item"}
              </span>{" "}
              and any deleted sub-items will be gone for good. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPurgeTarget(null)}
              disabled={purge.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={purge.isPending}
              onClick={() => {
                if (!purgeTarget) return;
                purge.mutate(
                  { projectId: purgeTarget.project_id, storyId: purgeTarget.id },
                  { onSuccess: () => setPurgeTarget(null) },
                );
              }}
            >
              {purge.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TrashRow({
  story,
  restoring,
  onRestore,
  onPurge,
}: {
  story: ITrashedStory;
  restoring: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-3">
      <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        <TypeGlyph type={storyTypeOf(story)} className="size-4" />
        <StatusIcon status={story.status} className="size-4" />
        <PriorityGlyph priority={story.priority} className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StoryCode code={story.code} />
          <p className="truncate text-sm font-medium">{story.title || "Untitled"}</p>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {story.project_name} · Deleted {relativeTime(story.deleted_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={restoring}
          onClick={onRestore}
        >
          <HugeiconsIcon icon={RefreshIcon} className="size-4" />
          {restoring ? "Restoring…" : "Restore"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${story.title || "work item"} permanently`}
          className="text-destructive hover:text-destructive"
          onClick={onPurge}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" />
        </Button>
      </div>
    </li>
  );
}
