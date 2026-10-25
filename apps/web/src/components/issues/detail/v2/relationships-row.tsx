"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { IssueImpact, IssueLinks, IssueRelations } from "@/components/issues/detail";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectStories } from "@/hooks/story/use-stories";
import { useStoryLinks, useStoryRelations } from "@/hooks/story/use-story-detail";
import { relationshipSummary } from "@/lib/issues/relationship-summary";
import { cn } from "@/lib/utils";
import type { IStory } from "@/types";

/**
 * "Relationships" on Overview (GIN-480) — one counter row that expands in place.
 *
 * Replaces four sections (sub-items, relations, links, impact) that each drew a
 * heading whether or not they had content. Counts come from queries the page
 * already makes, so the row costs no extra request.
 */
export function RelationshipsRow({
  story,
  workspaceSlug,
  projectId,
  onOpenStory,
  onCreateSubWork,
  onAddExistingSubWork,
  onAddLink,
  onAddRelation,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  onOpenStory?: (id: string) => void;
  onCreateSubWork: () => void;
  onAddExistingSubWork: () => void;
  onAddLink: () => void;
  onAddRelation: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: projectStories } = useProjectStories(workspaceSlug, projectId);
  const { data: relations } = useStoryRelations(workspaceSlug, projectId, story.id);
  const { data: links } = useStoryLinks(workspaceSlug, projectId, story.id);

  const summary = relationshipSummary({
    story,
    projectStories,
    relations,
    linkCount: links?.length ?? 0,
  });

  const counters: { label: string; value: string; warn?: boolean }[] = [];
  if (summary.subItems.total > 0) {
    counters.push({
      label: "Sub-items",
      value: `${summary.subItems.done}/${summary.subItems.total}`,
    });
  }
  if (summary.blocking > 0) counters.push({ label: "Blocking", value: String(summary.blocking) });
  if (summary.blockedBy > 0) {
    counters.push({ label: "Blocked by", value: String(summary.blockedBy), warn: true });
  }
  if (summary.related > 0) counters.push({ label: "Related", value: String(summary.related) });
  if (summary.duplicates > 0) {
    counters.push({ label: "Duplicates", value: String(summary.duplicates) });
  }
  if (summary.links > 0) counters.push({ label: "Links", value: String(summary.links) });

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground active:scale-[0.97]"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onCreateSubWork}>Create sub-work item</DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddExistingSubWork}>Add existing sub-work item</DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddRelation}>Add relation</DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddLink}>Add link</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">Relationships</span>
        {summary.isEmpty ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          counters.map((c, i) => (
            <span key={c.label} className="flex items-center gap-2">
              {i > 0 ? (
                <span className="text-border" aria-hidden>
                  ·
                </span>
              ) : null}
              <span className={cn(c.warn ? "text-destructive" : "text-foreground")}>
                {/* Never colour alone: the label carries the meaning. */}
                {c.label} <span className="tabular-nums">{c.value}</span>
              </span>
            </span>
          ))
        )}

        <div className="ml-auto flex items-center gap-1">
          {summary.isEmpty ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs active:scale-[0.97]"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Hide" : "View"}
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className={cn(
                  "size-3.5 transition-transform duration-200 ease-[var(--ease-out)]",
                  !open && "-rotate-90",
                )}
              />
            </Button>
          )}
          {addMenu}
        </div>
      </div>

      {open ? (
        <div className="space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
          <IssueImpact
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onOpenStory={onOpenStory}
          />
          <IssueRelations
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onOpenStory={onOpenStory}
            onAdd={onAddRelation}
          />
          <IssueLinks
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onAdd={onAddLink}
          />
        </div>
      ) : null}
    </section>
  );
}
