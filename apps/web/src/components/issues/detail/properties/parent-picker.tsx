"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useProjectStoriesPage, useStory, useUpdateStory } from "@/hooks/story/use-stories";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import type { IStory } from "@/types";

/** Inline picker for setting/clearing a work item's parent (`IStory.parent_id`). */
export function IssueParentPicker({
  story,
  workspaceSlug,
  projectId,
  cycleId,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const { setOffset, reset: resetPagination, pageFilters } = useOffsetPagination(20);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    resetPagination();
  }, [debouncedQ, resetPagination]);

  const { data: parent } = useStory(workspaceSlug, projectId, story.parent_id ?? "");
  const { data: page } = useProjectStoriesPage(workspaceSlug, projectId, {
    q: debouncedQ || undefined,
    product_only: true,
    ...pageFilters,
  });
  const updateStory = useUpdateStory(workspaceSlug, projectId, cycleId);

  const parentStory = parent ?? undefined;
  const candidates = (page?.items ?? []).filter(
    (s) => s.id !== story.id && s.parent_id !== story.id,
  );

  const setParent = (parentId: string | null) => {
    updateStory.mutate({ storyId: story.id, patch: { parent_id: parentId } });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <HugeiconsIcon icon={Link01Icon} data-icon="inline-start" />
          {parentStory ? parentStory.title : "Add parent"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Set parent…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No matching work items.</CommandEmpty>
            <CommandGroup>
              {story.parent_id ? (
                <CommandItem value="__remove_parent" onSelect={() => setParent(null)}>
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Remove parent</span>
                </CommandItem>
              ) : null}
              {candidates.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.title} ${s.id}`}
                  onSelect={() => setParent(s.id)}
                >
                  <span className="truncate">{s.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {(page?.total ?? 0) > (page?.limit ?? 20) ? (
            <div className="border-t px-2 py-1.5">
              <OffsetPagination
                offset={page?.offset ?? 0}
                limit={page?.limit ?? 20}
                total={page?.total ?? 0}
                onOffsetChange={setOffset}
              />
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
