"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUpdateStory } from "@/hooks/story/use-stories";
import { cn } from "@/lib/utils";
import { propertyTrigger } from "@/components/issues/shared/property-trigger";
import type { IStory } from "@/types";

export function StoryDateField({
  story, field, label, workspaceSlug, projectId, cycleId,
}: {
  story: IStory;
  field: "start_date" | "target_date";
  label: string;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
}) {
  const update = useUpdateStory(workspaceSlug, projectId, cycleId);
  const value = story[field];
  const display = value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" })
    : label;

  return (
    <Popover>
      <PopoverTrigger className={cn(propertyTrigger, value && "text-foreground")}>
        <HugeiconsIcon icon={Calendar03Icon} className="size-3.5" />
        {display}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => update.mutate({ storyId: story.id, patch: { [field]: e.target.value || null } })}
          className="rounded-md border bg-background px-2 py-1 text-sm outline-none"
          aria-label={label}
        />
      </PopoverContent>
    </Popover>
  );
}
