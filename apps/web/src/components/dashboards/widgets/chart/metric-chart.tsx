"use client";

import { useRouter } from "next/navigation";

import { ChartTooltip, ComposedChart, Grid, XAxis, YAxis } from "@/components/charts";
// Not re-exported by the charts barrel, but part of the same vendored package
// and what ComposedChart's grouped-bar layout is built to consume.
import { SeriesBar } from "@/components/charts/primitives/series-bar";
import type {
  IDailyActivityPoint,
  IPlannedWorkloadPoint,
  IWidgetSettings,
} from "@/types";

import { useWorkspaceHolidays } from "@/hooks/auth/use-auth";

import { WidgetMessage, WidgetSkeleton } from "../bodies/widget-body-shared";
import { ChartLegend } from "./chart-legend";
import {
  excludeNonWorkingDays,
  integerTickCount,
  periodEnd,
  type IChartSeries,
} from "./chart-series";
import { PeriodSelector } from "./period-selector";
import { CHART_MARGIN, COMPACT_MARGIN } from "./chart-layout";
import { ResponsiveChart } from "./responsive-chart";
import type { IChartControls } from "./use-chart-controls";

/** One period from either chart endpoint. `date` is the period's first day. */
export type TChartPoint = IDailyActivityPoint | IPlannedWorkloadPoint;

/**
 * One series' count on a point. The series list is data, so the lookup is
 * dynamic while the payload types stay exact — the single cast lives here
 * rather than at every call site.
 */
function valueAt(point: TChartPoint, key: string): number {
  return (point as unknown as Record<string, number>)[key] ?? 0;
}

/**
 * The chart both dashboard chart widgets are (GIN-527).
 *
 * Activity and planned workload differ only in which metrics they draw and
 * where those come from, so everything else — period switching, the
 * column-vs-line choice, legend toggling, the y-axis rescale that follows it,
 * drill-down and responsive sizing — lives here once. Adding a third chart is a
 * series list plus a data hook in the widget body.
 *
 * Presentational on purpose: the body owns the data hook, because a hook is not
 * a value and cannot be handed down as a prop.
 */
export function MetricChart({
  workspaceSlug,
  settings,
  series,
  controls,
  points,
  isPending,
  isError,
  emptyMessage,
  errorMessage,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
  series: readonly IChartSeries[];
  controls: IChartControls;
  points: TChartPoint[];
  isPending: boolean;
  isError: boolean;
  emptyMessage: string;
  errorMessage: string;
}) {
  const router = useRouter();
  const visible = series.filter((s) => !controls.hidden.has(s.key));
  // Filtered once, here, so the drill-down index, the totals and the y-axis max
  // below all read the same array the chart draws. Holidays come from the
  // workspace calendar; an empty one just means weekends only.
  const holidays = useWorkspaceHolidays(workspaceSlug);
  const shown = excludeNonWorkingDays(points, controls.period.bucket, holidays);

  // Drill-down uses the first visible series that has a real query, so hiding
  // everything but one metric also decides what a click opens. It needs a
  // project to open: the filtered work-item view is project-scoped, and a
  // workspace-wide chart has no single list that means the same thing.
  const drillSeries = visible.find((s) => s.drill);
  const projectId = settings?.project_id;
  const onPointClick =
    drillSeries?.drill && projectId
      ? (index: number) => {
          const start = shown[index]?.date;
          if (!start) return;
          const query = drillSeries.drill?.(start, periodEnd(start, controls.period.bucket));
          if (!query) return;
          router.push(
            `/${workspaceSlug}/projects/${projectId}/issues?gigsql=${encodeURIComponent(query)}`,
          );
        }
      : undefined;

  const populated = !isPending && !isError && shown.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Same row height either way, so locking the period never shifts the chart. */}
      <div className="flex h-7 shrink-0 items-center justify-end px-3 pt-2">
        {controls.locked ? (
          <span className="text-[11px] text-muted-foreground">Dashboard range</span>
        ) : (
          <PeriodSelector value={controls.range} onChange={controls.setRange} />
        )}
      </div>
      <ChartBody
        points={shown}
        visible={visible}
        isPending={isPending}
        isError={isError}
        emptyMessage={emptyMessage}
        errorMessage={errorMessage}
        onPointClick={onPointClick}
        drillLabel={drillSeries?.label}
      />
      {populated ? (
        <ChartLegend
          series={series}
          hidden={controls.hidden}
          onToggle={(key) => controls.toggle(key, series.length)}
        />
      ) : null}
    </div>
  );
}

function ChartBody({
  points,
  visible,
  isPending,
  isError,
  emptyMessage,
  errorMessage,
  onPointClick,
  drillLabel,
}: {
  points: TChartPoint[];
  visible: readonly IChartSeries[];
  isPending: boolean;
  isError: boolean;
  emptyMessage: string;
  errorMessage: string;
  onPointClick?: (index: number) => void;
  drillLabel?: string;
}) {
  if (isPending) return <WidgetSkeleton rows={4} />;
  if (isError) return <WidgetMessage>{errorMessage}</WidgetMessage>;

  const total = points.reduce(
    (sum, p) => sum + visible.reduce((row, s) => row + valueAt(p, s.key), 0),
    0,
  );
  if (total === 0) return <WidgetMessage>{emptyMessage}</WidgetMessage>;

  const max = Math.max(...points.flatMap((p) => visible.map((s) => valueAt(p, s.key))));

  return (
    <ResponsiveChart
      pointCount={points.length}
      onPointClick={onPointClick}
      pointLabel={(i) => `Open ${drillLabel ?? "work items"} for ${points[i]?.date}`}
    >
      {(box) => (
        <ComposedChart
          // The chart measures itself once and keeps that width, so a widget
          // that changed size draws its series into the plot it first saw —
          // bars laid out for a narrower box stop short of the axis. Remounting
          // on the settled size is what makes it measure again.
          key={box.sizeKey}
          data={points as unknown as Record<string, unknown>[]}
          xDataKey="date"
          // `auto` hands sizing back to the box: the chart's default is an
          // aspect ratio, which derives height from width and so overflows the
          // card the wider the widget gets.
          aspectRatio="auto"
          className="h-full"
          margin={box.compact ? COMPACT_MARGIN : CHART_MARGIN}
          barGap={2}
        >
          <Grid horizontal />
          {/* Columns at every period. Counts are discrete, and a line between
              two days draws values in between that never happened. */}
          {visible.map((s) => (
            <SeriesBar key={s.key} dataKey={s.key} fill={s.color} radius={2} />
          ))}
          {box.compact ? null : <XAxis numTicks={box.numTicks} />}
          <YAxis
            numTicks={integerTickCount(max)}
            formatValue={(v) => String(Math.round(v))}
          />
          <ChartTooltip />
        </ComposedChart>
      )}
    </ResponsiveChart>
  );
}
