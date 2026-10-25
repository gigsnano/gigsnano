"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateStoryRelation } from "@/hooks/story/use-story-detail";
import { useProjectStoriesPage } from "@/hooks/story/use-stories";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { EStoryRelationType } from "@/types";

const RELATION_OPTIONS: { value: EStoryRelationType; label: string }[] = [
  { value: EStoryRelationType.RelatesTo, label: "Relates to" },
  { value: EStoryRelationType.Blocks, label: "Blocks" },
  { value: EStoryRelationType.BlockedBy, label: "Blocked by" },
  { value: EStoryRelationType.Duplicate, label: "Duplicate of" },
];

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function CreateRelationDialog({
  storyId,
  workspaceSlug,
  projectId,
  open,
  onOpenChange,
}: {
  storyId: string;
  workspaceSlug: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [relationType, setRelationType] = useState(EStoryRelationType.RelatesTo);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { setOffset, reset: resetPagination, pageFilters } = useOffsetPagination(20);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    resetPagination();
  }, [debouncedQ, resetPagination]);

  const { data: page } = useProjectStoriesPage(workspaceSlug, projectId, {
    q: debouncedQ || undefined,
    product_only: true,
    ...pageFilters,
  });
  const create = useCreateStoryRelation(workspaceSlug, projectId, storyId);

  const candidates = (page?.items ?? []).filter((s) => s.id !== storyId);

  const reset = () => {
    setQuery("");
    setSelectedId(null);
    setRelationType(EStoryRelationType.RelatesTo);
  };

  const submit = async () => {
    if (!selectedId) return;
    await create.mutateAsync({ relation_type: relationType, related_story_id: selectedId });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle>Add relation</DialogTitle>
        <DialogDescription>Link this work item to another in the project.</DialogDescription>
        <div className="mt-4 flex flex-col gap-3">
          <select
            value={relationType}
            onChange={(e) => setRelationType(e.target.value as EStoryRelationType)}
            className={field}
          >
            {RELATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            aria-label="Search work items"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work items…"
            className={field}
          />
          <ul className="max-h-48 overflow-y-auto rounded-md border">
            {candidates.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={
                    selectedId === s.id
                      ? "w-full bg-accent px-3 py-2 text-left text-sm"
                      : "w-full px-3 py-2 text-left text-sm hover:bg-accent/50"
                  }
                >
                  {s.title}
                </button>
              </li>
            ))}
            {!candidates.length ? (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</li>
            ) : null}
          </ul>
          {(page?.total ?? 0) > (page?.limit ?? 20) ? (
            <OffsetPagination
              offset={page?.offset ?? 0}
              limit={page?.limit ?? 20}
              total={page?.total ?? 0}
              onOffsetChange={setOffset}
            />
          ) : null}
          <Button type="button" disabled={!selectedId || create.isPending} onClick={() => void submit()}>
            {create.isPending ? "Adding…" : "Add relation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
