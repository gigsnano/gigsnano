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
import { useMoveStory } from "@/hooks/story/use-stories";
import { STORY_STATUS_META, STORY_STATUS_ORDER } from "@/constants/story-meta";
import type { IStory } from "@/types";

import { StatusIcon } from "./status-icon";

/** Compact inline status picker — the status icon is the trigger. */
export function StatusPicker({
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
  const move = useMoveStory(workspaceSlug, projectId, cycleId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={move.isPending}
        aria-label={`Status: ${STORY_STATUS_META[story.status].label}`}
        className={cn(
          "flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent/60 active:scale-95",
          className,
        )}
      >
        <StatusIcon status={story.status} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {STORY_STATUS_ORDER.map((status) => (
          <DropdownMenuItem
            key={status}
            disabled={story.status === status}
            onSelect={() => move.mutate({ storyId: story.id, status })}
          >
            <StatusIcon status={status} />
            <span className="flex-1">{STORY_STATUS_META[status].label}</span>
            {story.status === status ? (
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
