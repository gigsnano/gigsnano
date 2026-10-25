"use client";

import { useCycles } from "@/hooks/project/use-cycles";
import { useUpdateStory } from "@/hooks/story/use-stories";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { IStory } from "@/types";

export function StoryCyclePicker({
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
  const { data: cycles } = useCycles(workspaceSlug, projectId);
  const update = useUpdateStory(workspaceSlug, projectId, cycleId);
  const current = (cycles ?? []).find((c) => c.id === story.cycle_id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 max-w-full items-center truncate rounded-md px-2 text-sm",
            current ? "font-medium text-primary hover:underline" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {current?.name ?? "Add cycle"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
        <DropdownMenuItem onSelect={() => update.mutate({ storyId: story.id, patch: { cycle_id: null } })}>
          No cycle
        </DropdownMenuItem>
        {(cycles ?? []).map((c) => (
          <DropdownMenuItem
            key={c.id}
            onSelect={() => update.mutate({ storyId: story.id, patch: { cycle_id: c.id } })}
          >
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
