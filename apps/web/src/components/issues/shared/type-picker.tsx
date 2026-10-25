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
import { useUpdateStory } from "@/hooks/story/use-stories";
import { STORY_TYPE_META, STORY_TYPE_ORDER } from "@/constants/story-meta";
import { storyTypeOf } from "@/lib/issues/story-type";
import type { IStory } from "@/types";

import { TypeGlyph } from "./type-glyph";

/** Compact inline type picker — the type glyph is the trigger. */
export function StoryTypePicker({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  className,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  className?: string;
}) {
  const update = useUpdateStory(workspaceSlug, projectId, cycleId);
  const current = storyTypeOf(story);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Type: ${STORY_TYPE_META[current].label}`}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md px-1.5 text-sm transition-colors hover:bg-accent/60 active:scale-95",
          className,
        )}
      >
        <TypeGlyph type={current} />
        <span className="text-foreground">{STORY_TYPE_META[current].label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STORY_TYPE_ORDER.map((type) => (
          <DropdownMenuItem
            key={type}
            onSelect={() => update.mutate({ storyId: story.id, patch: { type } })}
          >
            <TypeGlyph type={type} />
            <span className="flex-1">{STORY_TYPE_META[type].label}</span>
            {current === type ? (
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
