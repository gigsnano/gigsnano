"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { queryKeys } from "@/hooks/query-keys";
import { useProjects } from "@/hooks/project/use-projects";
import { useProjectStoriesPage, useWorkspaceStoriesPage } from "@/hooks/story/use-stories";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { storyCode } from "@/lib/issues/issue-routes";
import { subWorkLinkCandidates } from "@/lib/issues/sub-work-candidates";
import { cn } from "@/lib/utils";
import { storyService } from "@/services/story/story.service";
import type { IStory } from "@/types";

function StoryRow({
  story,
  identifier,
  checked,
  onToggle,
}: {
  story: IStory;
  identifier: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const key = storyCode(identifier, story);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 border-b border-border/50 px-4 py-2.5 text-left transition-colors last:border-b-0",
        checked ? "bg-accent/60" : "hover:bg-accent/40",
      )}
    >
      <Checkbox checked={checked} tabIndex={-1} aria-hidden />
      <StatusIcon status={story.status} className="size-3.5" />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{story.title}</span>
    </button>
  );
}

export function AddExistingSubWorkDialog({
  parentStory,
  workspaceSlug,
  projectId,
  cycleId,
  open,
  onOpenChange,
}: {
  parentStory: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedById, setSelectedById] = useState<Map<string, IStory>>(new Map());
  const [workspaceLevel, setWorkspaceLevel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setOffset, reset: resetPagination, pageFilters } = useOffsetPagination(20);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    resetPagination();
  }, [debouncedQ, workspaceLevel, resetPagination]);

  const queryClient = useQueryClient();
  const projectPage = useProjectStoriesPage(
    workspaceSlug,
    projectId,
    { q: debouncedQ || undefined, product_only: true, ...pageFilters },
    open && !workspaceLevel,
  );
  const workspacePage = useWorkspaceStoriesPage(
    workspaceSlug,
    { q: debouncedQ || undefined, product_only: true, ...pageFilters },
    workspaceLevel && open,
  );
  const { data: projects } = useProjects(workspaceSlug);

  const activeQuery = workspaceLevel ? workspacePage : projectPage;
  const page = activeQuery.data;
  const sourceStories = page?.items ?? [];

  const identifierByProject = new Map<string, string>();
  for (const p of projects ?? []) {
    identifierByProject.set(p.id, p.identifier);
  }

  const projectIdentifier = identifierByProject.get(projectId) ?? "—";

  const candidates = subWorkLinkCandidates(sourceStories, parentStory);

  const selectedIds = [...selectedById.keys()];

  const reset = () => {
    setQuery("");
    setSelectedById(new Map());
    setWorkspaceLevel(false);
  };

  const toggleSelected = (story: IStory) => {
    setSelectedById((prev) => {
      const next = new Map(prev);
      if (next.has(story.id)) next.delete(story.id);
      else next.set(story.id, story);
      return next;
    });
  };

  const invalidateAfterLink = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["workspaces", workspaceSlug, "projects", projectId, "stories"],
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.subStories(workspaceSlug, projectId, parentStory.id),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.story(workspaceSlug, projectId, parentStory.id),
      }),
      queryClient.invalidateQueries({ queryKey: ["workspaces", workspaceSlug, "stories"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects(workspaceSlug) }),
    ]);
    if (cycleId) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.cycleStories(workspaceSlug, projectId, cycleId),
      });
    }
  };

  const submit = async () => {
    if (!selectedIds.length || isSubmitting) return;
    setIsSubmitting(true);
    const byId = selectedById;
    await Promise.all(
      selectedIds.map((id) => {
        const item = byId.get(id);
        if (!item) return Promise.resolve();
        return storyService.updateStory(workspaceSlug, item.project_id, id, {
          parent_id: parentStory.id,
        });
      }),
    )
      .then(() => invalidateAfterLink())
      .then(() => {
        reset();
        onOpenChange(false);
      })
      .finally(() => setIsSubmitting(false));
  };

  const selectionLabel =
    selectedIds.length === 0
      ? "No work items selected"
      : selectedIds.length === 1
        ? "1 work item selected"
        : `${selectedIds.length} work items selected`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[min(85vh,640px)] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogDescription className="sr-only">
          Search and select work items to add as sub-work items.
        </DialogDescription>
        <DialogTitle className="sr-only">Add existing sub-work items</DialogTitle>

        <div className="flex items-center gap-2 border-b px-4 py-3">
          <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search"
            aria-label="Search work items"
            className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <span className="inline-flex h-7 items-center rounded-md border border-border bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground">
            {selectionLabel}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Workspace level</span>
            <Switch
              checked={workspaceLevel}
              onCheckedChange={setWorkspaceLevel}
              aria-label="Search workspace level work items"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {candidates.length ? (
            candidates.map((s) => (
              <StoryRow
                key={s.id}
                story={s}
                identifier={identifierByProject.get(s.project_id) ?? projectIdentifier}
                checked={selectedIds.includes(s.id)}
                onToggle={() => toggleSelected(s)}
              />
            ))
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No matching work items.
            </p>
          )}
        </div>

        {(page?.total ?? 0) > (page?.limit ?? 20) ? (
          <div className="border-t px-4 py-2">
            <OffsetPagination
              offset={page?.offset ?? 0}
              limit={page?.limit ?? 20}
              total={page?.total ?? 0}
              onOffsetChange={setOffset}
            />
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t bg-muted/20 px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selectedIds.length || isSubmitting}
            onClick={() => void submit()}
          >
            {isSubmitting ? "Adding…" : "Add selected work items"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
