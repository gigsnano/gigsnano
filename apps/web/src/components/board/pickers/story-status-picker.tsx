"use client";

import { useProjectStateLabels } from "@/hooks/project/use-project-settings";
import { useMoveStory } from "@/hooks/story/use-stories";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { propertyTrigger } from "@/components/issues/shared/property-trigger";
import { EStoryStatus, type IStory } from "@/types";

const STATUS_ORDER: EStoryStatus[] = [
  EStoryStatus.Todo,
  EStoryStatus.InProgress,
  EStoryStatus.InReview,
  EStoryStatus.Done,
];

const STATUS_DOT: Record<EStoryStatus, string> = {
  [EStoryStatus.Todo]: "bg-muted-foreground/50",
  [EStoryStatus.InProgress]: "bg-blue-500",
  [EStoryStatus.InReview]: "bg-amber-500",
  [EStoryStatus.Done]: "bg-emerald-500",
};

function StoryStatusBadge({
  status,
  label,
  className,
}: {
  status: EStoryStatus;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
      {label}
    </span>
  );
}

export function StoryStatusPicker({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  hideLabel = false,
  className,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  hideLabel?: boolean;
  className?: string;
}) {
  const { labels } = useProjectStateLabels(workspaceSlug, projectId);
  const move = useMoveStory(workspaceSlug, projectId, cycleId);

  const currentLabel = labels[story.status];

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {!hideLabel ? (
        <span className="text-xs font-medium text-muted-foreground">Status</span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={move.isPending}
          className={cn(propertyTrigger, "text-foreground")}
        >
          <StoryStatusBadge status={story.status} label={currentLabel} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {STATUS_ORDER.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={move.isPending || story.status === status}
              onSelect={() => move.mutate({ storyId: story.id, status })}
            >
              <StoryStatusBadge status={status} label={labels[status]} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
