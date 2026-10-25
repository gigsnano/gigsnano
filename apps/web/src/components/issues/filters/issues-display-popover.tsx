"use client";

import { useId, type ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCustomFields } from "@/hooks/project/use-project-settings";
import { treeModeFor } from "@/lib/issues/issue-tree";
import { ECustomFieldType } from "@/types";
import { useIssuesViewStore, type TGroupBy } from "@/store/ui/issues-view.store";
import { SortPanel } from "./sort-panel";

const GROUP_OPTIONS: { value: TGroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "type", label: "Type" },
  { value: "none", label: "None" },
];

/** "Display" popover — reads Group by → View → Sort: the two arrangement
 *  decisions sit together, ordering comes last. */
export function IssuesDisplayPopover({
  workspaceSlug,
  projectId,
  trigger,
}: {
  workspaceSlug: string;
  projectId: string;
  trigger: ReactNode;
}) {
  const groupBy = useIssuesViewStore((s) => s.groupBy);
  const layout = useIssuesViewStore((s) => s.layout);
  const showSubIssues = useIssuesViewStore((s) => s.showSubIssues);
  const setGroupBy = useIssuesViewStore((s) => s.setGroupBy);
  const setShowSubIssues = useIssuesViewStore((s) => s.setShowSubIssues);
  const calendarBasis = useIssuesViewStore((s) => s.calendarBasis);
  const setCalendarBasis = useIssuesViewStore((s) => s.setCalendarBasis);
  // Both toolbars can mount a Display popover, so the caption's id has to be
  // per-instance or `aria-describedby` resolves to the wrong copy.
  const viewCaptionId = useId();
  const datesCaptionId = useId();

  const customFields = useCustomFields(workspaceSlug, projectId);
  const selectFields = (customFields.data ?? []).filter(
    (f) => f.field_type === ECustomFieldType.Select && (f.options?.length ?? 0) > 0,
  );
  const groupOptions: { value: TGroupBy; label: string }[] = [
    ...GROUP_OPTIONS,
    ...selectFields.map((f) => ({ value: `cf:${f.id}` as TGroupBy, label: f.name })),
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <Segmented
          label="Group by"
          value={groupBy}
          options={groupOptions}
          onChange={setGroupBy}
        />
        {/* Calendar only: on every other layout an item's position comes from
            its status, its parent or its order, not from a date. */}
        {layout === "calendar" ? (
          <div className="mt-3 border-t pt-3">
            <Segmented
              label="Dates"
              value={calendarBasis}
              options={[
                { value: "due", label: "Due date" },
                { value: "start", label: "Start date" },
                { value: "span", label: "Span" },
              ]}
              onChange={setCalendarBasis}
              describedById={datesCaptionId}
            />
            <p id={datesCaptionId} className="mt-1.5 text-xs text-muted-foreground">
              {calendarBasis === "span"
                ? "Items stretch from their start date to their due date."
                : calendarBasis === "start"
                  ? "Items sit on their start date."
                  : "Items sit on their due date."}
            </p>
          </div>
        ) : null}

        {/* Only where it does something. Kanban, Calendar and Graph cannot
            indent a child under its parent — their vertical position is already
            owned by a status column or a date — so they are always flat and a
            control here would be a lie. A disabled control is worse than none. */}
        {treeModeFor(layout, false) === "nested" ? (
          <div className="mt-3 border-t pt-3">
            <Segmented
              label="View"
              value={showSubIssues ? "flat" : "hierarchy"}
              options={[
                { value: "hierarchy", label: "Hierarchy" },
                { value: "flat", label: "Flat" },
              ]}
              onChange={(v) => setShowSubIssues(v === "flat")}
              describedById={viewCaptionId}
            />
            {/* Says what the mode does to the list, because it also decides what
                every count in the view adds up to. Both strings are one line at
                this popover width, so swapping them cannot resize the panel. */}
            <p id={viewCaptionId} className="mt-1.5 text-xs text-muted-foreground">
              {showSubIssues
                ? "Every work item is its own row."
                : "Sub-items are nested under their parent."}
            </p>
          </div>
        ) : null}
        <div className="mt-3 border-t pt-3">
          <SortPanel />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  describedById,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  /** Id of prose spelling out what the current option does to the view. */
  describedById?: string;
}) {
  return (
    // A group with a name, and options that each report whether they are the
    // current one — without `aria-pressed` the selection is colour-only, so a
    // screen reader reads three identical buttons and never says which is on.
    <div role="group" aria-label={label} aria-describedby={describedById}>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium outline-none",
              // Named properties, not `transition-all`: the press scale must
              // ease back on release while nothing else rides along. Under
              // reduced motion the list drops back to colours only — tweening
              // the press turns what used to be an instant state change into
              // 150ms of movement, which is the thing the preference exists to
              // stop.
              "transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-colors",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              value === opt.value
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
