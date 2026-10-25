"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { IStory } from "@/types";

export interface IGanttSchedulePatch {
  start_date?: string | null;
  target_date?: string | null;
}

/**
 * The unscheduled backlog (GIN-351, Phase 3 of GIN-315). Stories with no dates
 * live here instead of rendering as empty timeline rows. When open it's the
 * primary space-filler under the compact timeline strip (so the view never shows
 * a large empty pane); when collapsed it's just its header. Scheduling is
 * explicit — inline Start/Due native pickers per row + a bulk "set Start for the
 * selected" — so a date is never invented silently. Read-only hides every editor.
 */
export function GanttBacklog({
  stories,
  getCode,
  readOnly,
  collapsed,
  onToggleCollapsed,
  onSchedule,
  onOpenStory,
}: {
  stories: IStory[];
  getCode: (story: IStory) => string;
  readOnly: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSchedule: (storyId: string, patch: IGanttSchedulePatch) => void;
  onOpenStory: (storyId: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (stories.length === 0) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkSchedule = (start: string) => {
    if (!start) return;
    for (const id of selected) onSchedule(id, { start_date: start });
    setSelected(new Set());
  };

  return (
    <section
      className={cn(
        "flex flex-col border-t bg-muted/20",
        // Collapsed, this is a footer bar and belongs AT the bottom. `mt-auto`
        // docks it there no matter how tall the timeline above actually renders
        // — relying on the timeline to fill the space leaves the bar stranded
        // mid-page with dead space below it whenever dhtmlx sizes its canvas to
        // its content rather than to the flex box.
        collapsed ? "mt-auto shrink-0" : "min-h-0 flex-1",
      )}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="group flex items-center gap-1.5 text-sm font-medium text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className={cn(
              "size-4 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
              !collapsed && "rotate-90",
            )}
          />
          Unscheduled
          <span className="tabular-nums text-muted-foreground">{stories.length}</span>
        </button>
        {!collapsed && !readOnly && selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Set Start for {selected.size} selected
            </span>
            <input
              type="date"
              aria-label="Bulk start date for selected work items"
              className="rounded-md border bg-background px-2 py-1 text-xs outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(e) => bulkSchedule(e.target.value)}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-2">
          {stories.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-accent/60 motion-reduce:transition-none"
            >
              {!readOnly ? (
                <Checkbox
                  checked={selected.has(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                  aria-label={`Select ${getCode(s)}`}
                />
              ) : null}
              <span className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
                {getCode(s)}
              </span>
              <button
                type="button"
                onClick={() => onOpenStory(s.id)}
                className="min-w-0 flex-1 truncate text-left text-sm text-foreground transition-colors hover:text-primary"
                title={s.title}
              >
                {s.title}
              </button>
              {readOnly ? (
                <span className="shrink-0 text-xs text-muted-foreground">No dates</span>
              ) : (
                <div className="flex shrink-0 items-center gap-1.5">
                  <BacklogDate
                    label={`Start date for ${getCode(s)}`}
                    placeholder="Start"
                    onSet={(v) => onSchedule(s.id, { start_date: v })}
                  />
                  <BacklogDate
                    label={`Due date for ${getCode(s)}`}
                    placeholder="Due"
                    onSet={(v) => onSchedule(s.id, { target_date: v })}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** A single labelled native date picker. Empty value is a no-op (never schedules). */
function BacklogDate({
  label,
  placeholder,
  onSet,
}: {
  label: string;
  placeholder: string;
  onSet: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="select-none">{placeholder}</span>
      <input
        type="date"
        aria-label={label}
        className="rounded-md border bg-background px-1.5 py-1 text-xs text-foreground outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onChange={(e) => e.target.value && onSet(e.target.value)}
      />
    </label>
  );
}
