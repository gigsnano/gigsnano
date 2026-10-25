"use client";

import { useDashboardMetrics } from "@/hooks/workspace/use-dashboards";
import { STORY_PRIORITY_META, STORY_PRIORITY_ORDER } from "@/constants/story-meta";
import { EStoryPriority, type IWidgetSettings } from "@/types";
import { toMetricsParams } from "@/lib/dashboards/widget-filters";
import { cn } from "@/lib/utils";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

const PRIORITY_FILL: Record<EStoryPriority, string> = {
  [EStoryPriority.Urgent]: "bg-red-500",
  [EStoryPriority.High]: "bg-orange-500",
  [EStoryPriority.Medium]: "bg-amber-500",
  [EStoryPriority.Low]: "bg-blue-500",
  [EStoryPriority.None]: "bg-muted-foreground/40",
};

/**
 * GIN-118 — Work items by priority as labelled horizontal meters with counts +
 * percentages. Bars grow from the left on mount.
 */
export function PriorityBreakdownBody({
  workspaceSlug,
  settings,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  const { data, isPending, isError } = useDashboardMetrics(
    workspaceSlug,
    toMetricsParams(settings),
  );

  if (isPending) return <WidgetSkeleton rows={5} />;
  if (isError || !data) return <WidgetMessage>Couldn&apos;t load priority data.</WidgetMessage>;
  if (!data.total) return <WidgetMessage>No work items to chart yet.</WidgetMessage>;

  const total = data.total;
  const rows = STORY_PRIORITY_ORDER.map((p) => ({
    key: p,
    label: STORY_PRIORITY_META[p].label,
    fill: PRIORITY_FILL[p],
    count: data.priority_counts[p] ?? 0,
  }));

  return (
    <ul className="flex flex-col gap-3 p-4">
      {rows.map((row) => {
        const pct = total ? Math.round((row.count / total) * 100) : 0;
        return (
          <li key={row.key} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium">
                <span className={cn("size-2.5 rounded-full", row.fill)} />
                {row.label}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {row.count} <span className="opacity-60">· {pct}%</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("gn-grow-bar h-full rounded-full", row.fill)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
