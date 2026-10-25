"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, RulerIcon } from "@hugeicons/core-free-icons";

import { useProject } from "@/hooks/project/use-projects";
import { useUpdateStory } from "@/hooks/story/use-stories";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ESize, type IStory } from "@/types";

const SIZES = [ESize.XS, ESize.S, ESize.M, ESize.L, ESize.XL];

function sizeLabel(size: ESize): string {
  return size.toUpperCase();
}

export function StorySizeChip({ size }: { size: ESize }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {sizeLabel(size)}
    </span>
  );
}

/**
 * Simple-sizing control (GIN-331) — XS/S/M/L/XL. Renders only in the "simple"
 * planning method (mirrors StoryEstimatePicker's Points-only gate) so a size
 * never surfaces on an Automatic/Points/Time project. null = unestimated.
 */
export function StorySizePicker({
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

  if (project?.planning_method !== "simple") return null;

  const current = story.size ?? null;
  const setSize = (size: ESize | null) => update.mutate({ storyId: story.id, patch: { size } });

  return (
    <div className={cn("flex items-center gap-2", fullWidth && "w-full")}>
      {!hideLabel ? <span className="text-xs font-medium text-muted-foreground">Size</span> : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-left text-sm transition-colors hover:bg-accent/50 active:scale-[0.97]",
            fullWidth && "w-full",
          )}
        >
          {current ? (
            <StorySizeChip size={current} />
          ) : (
            <>
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HugeiconsIcon icon={RulerIcon} className="size-3.5" />
              </span>
              <span className="text-muted-foreground">None</span>
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {SIZES.map((size) => (
            <DropdownMenuItem
              key={size}
              disabled={update.isPending}
              onSelect={() => setSize(size)}
            >
              <StorySizeChip size={size} />
              <span className="text-sm text-muted-foreground">{sizeName(size)}</span>
            </DropdownMenuItem>
          ))}
          {current ? (
            <DropdownMenuItem disabled={update.isPending} onSelect={() => setSize(null)}>
              <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-muted-foreground" />
              Clear size
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function sizeName(size: ESize): string {
  return {
    [ESize.XS]: "Extra small",
    [ESize.S]: "Small",
    [ESize.M]: "Medium",
    [ESize.L]: "Large",
    [ESize.XL]: "Extra large",
  }[size];
}
