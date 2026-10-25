"use client";

import { useDashboardMetrics } from "@/hooks/workspace/use-dashboards";
import { STORY_STATUS_META } from "@/constants/story-meta";
import { EStoryStatus, type IWidgetSettings } from "@/types";
import { toMetricsParams } from "@/lib/dashboards/widget-filters";

import { WidgetMessage } from "./widget-body-shared";

/**
 * GIN-50 / GIN-54 — Counter tile. One headline metric from the server-side
 * metrics endpoint over the widget's filters. Defaults to open items (not done);
 * a status filter counts that status instead.
 */
export function CounterBody({
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

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <div className="h-9 w-16 animate-pulse rounded bg-muted" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (isError || !data) return <WidgetMessage>Couldn&apos;t load metric.</WidgetMessage>;

  const statusFilter = settings?.status as EStoryStatus | undefined;
  const count = statusFilter ? data.total : data.open;
  const label = statusFilter ? STORY_STATUS_META[statusFilter].label : "Open work items";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
      <span className="text-4xl font-semibold tabular-nums tracking-tight">{count}</span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-[10px] text-muted-foreground">of {data.total} matched</span>
    </div>
  );
}
