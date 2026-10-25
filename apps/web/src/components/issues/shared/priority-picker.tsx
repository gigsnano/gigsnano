"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { propertyTrigger } from "@/components/issues/shared/property-trigger";
import { useUpdateStory } from "@/hooks/story/use-stories";
import { STORY_PRIORITY_META, STORY_PRIORITY_ORDER } from "@/constants/story-meta";
import { EStoryPriority, type IStory } from "@/types";

import { PriorityGlyph } from "./priority-glyph";

/** Inline priority picker — icon-only in list (`compact`), glyph+label elsewhere. */
export function PriorityPicker({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  compact = false,
  className,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  /** List/kanban: icon-only trigger (Plane). Detail/create: glyph + label chip. */
  compact?: boolean;
  className?: string;
}) {
  const update = useUpdateStory(workspaceSlug, projectId, cycleId);
  const hasPriority = story.priority !== EStoryPriority.None;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Priority: ${STORY_PRIORITY_META[story.priority].label}`}
        className={cn(
          compact
            ? "flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent/60 active:scale-95"
            : propertyTrigger,
          hasPriority && "text-foreground",
          className,
        )}
      >
        <PriorityGlyph priority={story.priority} />
        {compact ? null : (
          <span>{hasPriority ? STORY_PRIORITY_META[story.priority].label : "Priority"}</span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        {STORY_PRIORITY_ORDER.map((priority) => (
          <DropdownMenuItem
            key={priority}
            onSelect={() => update.mutate({ storyId: story.id, patch: { priority } })}
          >
            <PriorityGlyph priority={priority} />
            <span className="flex-1">{STORY_PRIORITY_META[priority].label}</span>
            {story.priority === priority ? (
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
