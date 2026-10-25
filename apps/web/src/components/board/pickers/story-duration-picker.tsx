"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Timer01Icon } from "@hugeicons/core-free-icons";

import { useProject } from "@/hooks/project/use-projects";
import { useUpdateStory } from "@/hooks/story/use-stories";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DURATION_PRESETS_MIN, formatDuration } from "@/lib/issues/estimate-values";
import { cn } from "@/lib/utils";
import type { IStory } from "@/types";

export function StoryDurationChip({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {formatDuration(minutes)}
    </span>
  );
}

/**
 * Time-estimate control (GIN-331) — a duration in whole minutes, offered as
 * preset increments so entry is always valid. Renders only in the "time"
 * planning method; never derived from points/sizes. null = unestimated.
 */
export function StoryDurationPicker({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  hideLabel = false,
  fullWidth = false,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  hideLabel?: boolean;
  fullWidth?: boolean;
}) {
  const { data: project } = useProject(workspaceSlug, projectId);
  const update = useUpdateStory(workspaceSlug, projectId, cycleId);

  if (project?.planning_method !== "time") return null;

  const current = story.duration_minutes ?? null;
  const setDuration = (duration_minutes: number | null) =>
    update.mutate({ storyId: story.id, patch: { duration_minutes } });

  return (
    <div className={cn("flex items-center gap-2", fullWidth && "w-full")}>
      {!hideLabel ? (
        <span className="text-xs font-medium text-muted-foreground">Duration</span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-left text-sm transition-colors hover:bg-accent/50 active:scale-[0.97]",
            fullWidth && "w-full",
          )}
        >
          {current != null ? (
            <StoryDurationChip minutes={current} />
          ) : (
            <>
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Timer01Icon} className="size-3.5" />
              </span>
              <span className="text-muted-foreground">None</span>
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 w-40 overflow-y-auto">
          {DURATION_PRESETS_MIN.map((min) => (
            <DropdownMenuItem
              key={min}
              disabled={update.isPending}
              onSelect={() => setDuration(min)}
            >
              <StoryDurationChip minutes={min} />
            </DropdownMenuItem>
          ))}
          {current != null ? (
            <DropdownMenuItem disabled={update.isPending} onSelect={() => setDuration(null)}>
              <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-muted-foreground" />
              Clear duration
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
