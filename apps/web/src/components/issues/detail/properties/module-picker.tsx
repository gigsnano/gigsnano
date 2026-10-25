"use client";

import { useModules } from "@/hooks/project/use-modules";
import { useUpdateStory } from "@/hooks/story/use-stories";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { IStory } from "@/types";

export function StoryModulePicker({
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
  const { data: modules } = useModules(workspaceSlug, projectId);
  const update = useUpdateStory(workspaceSlug, projectId, cycleId);
  const current = (modules ?? []).find((m) => m.id === story.module_id);

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
          {current?.name ?? "Add module"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
        <DropdownMenuItem onSelect={() => update.mutate({ storyId: story.id, patch: { module_id: null } })}>
          No module
        </DropdownMenuItem>
        {(modules ?? []).map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => update.mutate({ storyId: story.id, patch: { module_id: m.id } })}
          >
            {m.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
