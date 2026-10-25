"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tag01Icon, Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { useProjectLabels } from "@/hooks/project/use-project-settings";
import { useUpdateStoryLabels } from "@/hooks/story/use-stories";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { ID, IProjectLabel, IStory } from "@/types";

function LabelChip({
  name,
  color,
  onRemove,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex max-w-[8rem] items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove label ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

/**
 * Multi-select label control (GIN-475). Picking a label appends it and keeps the
 * popover open — assigning three labels shouldn't cost three trips through the
 * trigger. Every write is a set-replacement of the whole list, so adding and
 * removing are the same operation and neither can drop the others.
 */
export function StoryLabelPicker({
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
  const { data: labels } = useProjectLabels(workspaceSlug, projectId);
  const updateLabels = useUpdateStoryLabels(workspaceSlug, projectId, cycleId);
  const [open, setOpen] = useState(false);

  const selectedIds = story.label_ids ?? [];
  const selectedSet = new Set(selectedIds);
  const byId = new Map((labels ?? []).map((l) => [l.id, l]));
  const selected = selectedIds.flatMap((id) => byId.get(id) ?? []);

  const write = (ids: ID[]) => updateLabels.mutate({ storyId: story.id, labelIds: ids });

  const toggle = (label: IProjectLabel) =>
    write(
      selectedSet.has(label.id)
        ? selectedIds.filter((id) => id !== label.id)
        : [...selectedIds, label.id],
    );

  return (
    <div className={cn("flex items-center gap-2", fullWidth && "w-full")}>
      {!hideLabel ? (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Labels</span>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label="Edit labels"
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-left text-sm transition-colors hover:bg-accent/50",
            fullWidth && "w-full",
          )}
        >
          {selected.length ? (
            // Wraps rather than clipping, so a narrow side panel still shows every chip.
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {selected.map((l) => (
                <LabelChip
                  key={l.id}
                  name={l.name}
                  color={l.color}
                  onRemove={() => write(selectedIds.filter((id) => id !== l.id))}
                />
              ))}
            </span>
          ) : (
            <>
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <HugeiconsIcon icon={Tag01Icon} className="size-3.5" />
              </span>
              <span className="text-muted-foreground">No labels</span>
            </>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-0">
          <Command>
            <CommandInput placeholder="Search labels…" />
            <CommandList>
              <CommandEmpty>
                {(labels ?? []).length === 0
                  ? "Add labels in project settings first."
                  : "No matching label."}
              </CommandEmpty>
              <CommandGroup>
                {(labels ?? []).map((l) => {
                  const isSelected = selectedSet.has(l.id);
                  return (
                    <CommandItem key={l.id} value={l.name} onSelect={() => toggle(l)}>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {isSelected ? <HugeiconsIcon icon={Tick02Icon} className="size-3" /> : null}
                      </span>
                      <LabelChip name={l.name} color={l.color} />
                      <span className="sr-only">{isSelected ? "selected" : "not selected"}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function StoryLabelChip({ name, color }: { name: string; color: string }) {
  return <LabelChip name={name} color={color} />;
}
