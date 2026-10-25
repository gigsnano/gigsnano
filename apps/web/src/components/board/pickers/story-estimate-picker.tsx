"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Calculator01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { useProjectEstimates } from "@/hooks/project/use-project-settings";
import { useProject } from "@/hooks/project/use-projects";
import { useUpdateStoryEstimate } from "@/hooks/story/use-stories";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatPoints, valuesForType } from "@/lib/issues/estimate-values";
import type { IProjectEstimate, IStory } from "@/types";

export function StoryEstimateChip({
  points,
  type,
}: {
  points: number;
  type: IProjectEstimate["type"];
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {formatPoints(points, type)}
    </span>
  );
}

export function StoryEstimatePicker({
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
  const { data: estimates } = useProjectEstimates(workspaceSlug, projectId);
  const { data: project } = useProject(workspaceSlug, projectId);
  const updateEstimate = useUpdateStoryEstimate(workspaceSlug, projectId, cycleId);

  // Estimates only apply in Points mode (GIN-331). Automatic is estimate-free, and
  // Simple/Time modes get their own controls later — so points never surface in a
  // non-Points project. Hidden while the method is still loading, to avoid flashing
  // points on an Automatic project.
  if (project?.planning_method !== "points") return null;

  const scales = estimates ?? [];
  if (scales.length === 0) return null;

  const activeScale =
    scales.find((e) => e.id === story.estimate_id) ?? scales[0];
  const current =
    story.estimate_id && story.estimate_points != null
      ? { scale: activeScale, points: story.estimate_points }
      : null;

  const onSelect = (scaleId: string, points: number) => {
    updateEstimate.mutate({ storyId: story.id, estimateId: scaleId, estimatePoints: points });
  };

  return (
    <div className={cn("flex items-center gap-2", fullWidth && "w-full")}>
      {!hideLabel ? (
        <span className="text-xs font-medium text-muted-foreground">Estimate</span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-left text-sm transition-colors hover:bg-accent/50 active:scale-[0.97]",
            fullWidth && "w-full",
          )}
        >
          {current ? (
            <StoryEstimateChip points={current.points} type={current.scale.type} />
          ) : (
            <>
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Calculator01Icon} className="size-3.5" />
              </span>
              <span className="text-muted-foreground">None</span>
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
          {scales.map((scale) =>
            valuesForType(scale.type).map((pts) => (
              <DropdownMenuItem
                key={`${scale.id}-${pts}`}
                disabled={updateEstimate.isPending}
                onSelect={() => onSelect(scale.id, pts)}
              >
                <span className="truncate text-sm">{scale.name}</span>
                <StoryEstimateChip points={pts} type={scale.type} />
              </DropdownMenuItem>
            )),
          )}
          {story.estimate_id ? (
            <DropdownMenuItem
              disabled={updateEstimate.isPending}
              onSelect={() =>
                updateEstimate.mutate({
                  storyId: story.id,
                  estimateId: null,
                  estimatePoints: null,
                })
              }
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-muted-foreground" />
              Clear estimate
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
