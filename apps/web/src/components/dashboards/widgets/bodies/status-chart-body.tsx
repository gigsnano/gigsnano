"use client";

import { useDashboardMetrics } from "@/hooks/workspace/use-dashboards";
import {
  STORY_STATUS_META,
  STORY_STATUS_ORDER,
  STORY_PRIORITY_META,
  STORY_PRIORITY_ORDER,
} from "@/constants/story-meta";
import { EStoryPriority, EWidgetGroupBy, type IWidgetSettings } from "@/types";
import { cn } from "@/lib/utils";
import { toMetricsParams } from "@/lib/dashboards/widget-filters";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

/** Solid fills for the priority dimension (STORY_PRIORITY_META only carries text/chip). */
const PRIORITY_FILL: Record<EStoryPriority, string> = {
  [EStoryPriority.Urgent]: "bg-red-500",
  [EStoryPriority.High]: "bg-orange-500",
  [EStoryPriority.Medium]: "bg-amber-500",
  [EStoryPriority.Low]: "bg-blue-500",
  [EStoryPriority.None]: "bg-muted-foreground/40",
};

interface Segment {
  key: string;
  label: string;
  fill: string;
  count: number;
}

/**
 * GIN-49 / GIN-54 — Status breakdown widget. Renders a stacked bar + legend from
 * the server-side metrics endpoint (honouring the widget's filters). Breaks down
 * by status (default) or priority when grouped by priority.
 */
export function StatusChartBody({
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

  if (isPending) return <WidgetSkeleton rows={3} />;
  if (isError || !data) return <WidgetMessage>Couldn&apos;t load status data.</WidgetMessage>;
  if (!data.total) return <WidgetMessage>No work items to chart yet.</WidgetMessage>;

  const byPriority = settings?.group_by === EWidgetGroupBy.Priority;
  const segments: Segment[] = byPriority
    ? STORY_PRIORITY_ORDER.map((p) => ({
        key: p,
        label: STORY_PRIORITY_META[p].label,
        fill: PRIORITY_FILL[p],
        count: data.priority_counts[p] ?? 0,
      }))
    : STORY_STATUS_ORDER.map((s) => ({
        key: s,
        label: STORY_STATUS_META[s].label,
        fill: STORY_STATUS_META[s].fill,
        count: data.status_counts[s] ?? 0,
      }));

  const total = data.total;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.key}
              className={cn("h-full", seg.fill)}
              style={{ width: `${(seg.count / total) * 100}%` }}
              title={`${seg.label}: ${seg.count}`}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-2 text-xs">
            <span className={cn("size-2.5 rounded-full", seg.fill)} />
            <span className="flex-1 truncate text-muted-foreground">{seg.label}</span>
            <span className="font-medium tabular-nums">{seg.count}</span>
            <span className="w-10 text-right text-muted-foreground tabular-nums">
              {Math.round((seg.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
