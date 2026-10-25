"use client";

import { useDashboardMetrics } from "@/hooks/workspace/use-dashboards";
import {
  STORY_STATUS_META,
  STORY_STATUS_ORDER,
  STORY_STATUS_STROKE as STATUS_STROKE,
} from "@/constants/story-meta";
import { EStoryStatus, type IWidgetSettings } from "@/types";
import { toMetricsParams } from "@/lib/dashboards/widget-filters";
import { cn } from "@/lib/utils";

import { WidgetMessage, WidgetSkeleton } from "./widget-body-shared";

const R = 42;
const C = 2 * Math.PI * R;

interface Segment {
  key: string;
  label: string;
  stroke: string;
  count: number;
}

/**
 * GIN-118 — Work items by status as an SVG donut with a centered total + legend.
 * Same metrics source as the status bar, richer presentation for overview boards.
 */
export function StatusDonutBody({
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

  if (isPending) return <WidgetSkeleton rows={4} />;
  if (isError || !data) return <WidgetMessage>Couldn&apos;t load status data.</WidgetMessage>;
  if (!data.total) return <WidgetMessage>No work items to chart yet.</WidgetMessage>;

  const total = data.total;
  // One pass: build the visible segments and their cumulative arc offset so the
  // JSX map is a pure render (no accumulator mutation the compiler can't lower).
  const segments: (Segment & { len: number; offset: number })[] = [];
  let running = 0;
  for (const s of STORY_STATUS_ORDER) {
    const count = data.status_counts[s] ?? 0;
    if (count === 0) continue;
    const len = (count / total) * C;
    segments.push({
      key: s,
      label: STORY_STATUS_META[s].label,
      stroke: STATUS_STROKE[s],
      count,
      len,
      offset: running,
    });
    running += len;
  }

  return (
    <div className="flex h-full items-center gap-4 p-4">
      <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label="Status breakdown">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-muted)" strokeWidth="12" />
        {segments.map((seg) => (
          <circle
            key={seg.key}
            className="gn-donut-ring"
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={seg.stroke}
            strokeWidth="12"
            strokeDasharray={`${seg.len} ${C - seg.len}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-col">
          <span className="text-xl font-semibold tabular-nums leading-none">{total}</span>
          <span className="text-xs text-muted-foreground">total items</span>
        </div>
        <ul className="flex flex-col gap-1">
          {segments.map((seg) => (
            <li key={seg.key} className="flex items-center gap-2 text-xs">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: seg.stroke }} />
              <span className="flex-1 truncate text-muted-foreground">{seg.label}</span>
              <span className={cn("font-medium tabular-nums")}>{seg.count}</span>
              <span className="w-9 text-right text-muted-foreground tabular-nums">
                {Math.round((seg.count / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
