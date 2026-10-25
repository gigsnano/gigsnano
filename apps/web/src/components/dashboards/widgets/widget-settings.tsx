"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { FilterIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjects } from "@/hooks/project/use-projects";
import { useMembers } from "@/hooks/workspace/use-members";
import { DATE_RANGE_LABELS } from "@/constants/dashboard-date-ranges";
import { STORY_STATUS_ORDER, STORY_STATUS_META, STORY_PRIORITY_ORDER, STORY_PRIORITY_META } from "@/constants/story-meta";
import {
  EDashboardWidgetType,
  EKpiMetric,
  EWidgetDateRange,
  EWidgetGroupBy,
  type IWidgetSettings,
} from "@/types";
import { cn } from "@/lib/utils";

/** Widget types that support grouping (list + chart). */
const GROUPABLE = new Set([
  EDashboardWidgetType.StoryList,
  EDashboardWidgetType.StatusChart,
]);

/**
 * Widgets whose date window IS their x-axis rather than a filter on creation
 * (GIN-160). They can't offer "All time": the endpoint caps the window, so an
 * unbounded choice would silently render a bounded chart.
 */
const WINDOWED = new Set([
  EDashboardWidgetType.DailyActivity,
  EDashboardWidgetType.PlannedWorkload,
]);

const DATE_RANGES = Object.values(EWidgetDateRange);
const BOUNDED_DATE_RANGES = DATE_RANGES.filter((r) => r !== EWidgetDateRange.All);

const KPI_METRIC_LABELS: Record<EKpiMetric, string> = {
  [EKpiMetric.OpenItems]: "Open work items",
  [EKpiMetric.InProgress]: "In progress",
  [EKpiMetric.InReview]: "In review",
  [EKpiMetric.Completed]: "Completed",
  [EKpiMetric.ActiveProjects]: "Active projects",
  [EKpiMetric.TotalProjects]: "Total projects",
  [EKpiMetric.ActiveCycles]: "Active sprints",
  [EKpiMetric.Members]: "Team members",
};

const GROUP_BY_LABELS: Record<EWidgetGroupBy, string> = {
  [EWidgetGroupBy.None]: "No grouping",
  [EWidgetGroupBy.Status]: "Status",
  [EWidgetGroupBy.Priority]: "Priority",
  [EWidgetGroupBy.Project]: "Project",
  [EWidgetGroupBy.Assignee]: "Assignee",
};

function FilterField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {children}
      </select>
    </label>
  );
}

export function WidgetSettings({
  type,
  workspaceSlug,
  settings,
  onChange,
}: {
  type: EDashboardWidgetType;
  workspaceSlug: string;
  settings: IWidgetSettings;
  onChange: (settings: IWidgetSettings) => void;
}) {
  const { data: projects } = useProjects(workspaceSlug);
  const { data: members } = useMembers(workspaceSlug);

  const set = (patch: Partial<IWidgetSettings>) => onChange({ ...settings, ...patch });
  const dateRange = settings.date_range ?? EWidgetDateRange.All;
  // The Introduction widget renders static text -- it has no data to filter.
  const filterable = type !== EDashboardWidgetType.Introduction;
  const active = Boolean(
    filterable &&
      (settings.project_id ||
        settings.assignee_id ||
        settings.priority ||
        settings.status ||
        (settings.group_by && settings.group_by !== EWidgetGroupBy.None) ||
        dateRange !== EWidgetDateRange.All),
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={filterable ? "Widget filters" : "Widget settings"}
          className={cn(active && "text-primary")}
        >
          <HugeiconsIcon icon={FilterIcon} className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{filterable ? "Filters" : "Settings"}</span>
          {active ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange({})}
            >
              Clear all
            </button>
          ) : null}
        </div>

        {type === EDashboardWidgetType.Introduction ? (
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-muted-foreground">Message</span>
            <textarea
              rows={4}
              value={settings.text ?? ""}
              placeholder="What should readers of this board know?"
              onChange={(e) => set({ text: e.target.value })}
              className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
        ) : null}

        {!filterable ? null : (
        <>
        {type === EDashboardWidgetType.Kpi ? (
          <FilterField
            label="Metric"
            value={settings.metric ?? EKpiMetric.OpenItems}
            onChange={(v) => set({ metric: v as EKpiMetric })}
          >
            {Object.values(EKpiMetric).map((m) => (
              <option key={m} value={m}>
                {KPI_METRIC_LABELS[m]}
              </option>
            ))}
          </FilterField>
        ) : null}

        <FilterField
          label="Project"
          value={settings.project_id ?? ""}
          onChange={(v) => set({ project_id: v || undefined })}
        >
          <option value="">All projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterField>

        <FilterField
          label="Assignee"
          value={settings.assignee_id ?? ""}
          onChange={(v) => set({ assignee_id: v || undefined })}
        >
          <option value="">Anyone</option>
          {members?.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </FilterField>

        <div className="grid grid-cols-2 gap-3">
          <FilterField
            label="Priority"
            value={settings.priority ?? ""}
            onChange={(v) => set({ priority: v || undefined })}
          >
            <option value="">Any</option>
            {STORY_PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {STORY_PRIORITY_META[p].label}
              </option>
            ))}
          </FilterField>
          <FilterField
            label="Status"
            value={settings.status ?? ""}
            onChange={(v) => set({ status: v || undefined })}
          >
            <option value="">Any</option>
            {STORY_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STORY_STATUS_META[s].label}
              </option>
            ))}
          </FilterField>
        </div>

        {GROUPABLE.has(type) ? (
          <FilterField
            label="Group by"
            value={settings.group_by ?? EWidgetGroupBy.None}
            onChange={(v) => set({ group_by: v as EWidgetGroupBy })}
          >
            {Object.values(EWidgetGroupBy).map((g) => (
              <option key={g} value={g}>
                {GROUP_BY_LABELS[g]}
              </option>
            ))}
          </FilterField>
        ) : null}

        <>
            <FilterField
              label={WINDOWED.has(type) ? "Window" : "Created"}
              value={dateRange}
              onChange={(v) => set({ date_range: v as EWidgetDateRange })}
            >
              {(WINDOWED.has(type) ? BOUNDED_DATE_RANGES : DATE_RANGES).map((r) => (
                <option key={r} value={r}>
                  {DATE_RANGE_LABELS[r]}
                </option>
              ))}
            </FilterField>

            {dateRange === EWidgetDateRange.Custom ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">From</span>
                  <input
                    type="date"
                    value={settings.date_from ?? ""}
                    max={settings.date_to || undefined}
                    onChange={(e) => set({ date_from: e.target.value || undefined })}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">To</span>
                  <input
                    type="date"
                    value={settings.date_to ?? ""}
                    min={settings.date_from || undefined}
                    onChange={(e) => set({ date_to: e.target.value || undefined })}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </label>
              </div>
            ) : null}
        </>
        </>
        )}
      </PopoverContent>
    </Popover>
  );
}
