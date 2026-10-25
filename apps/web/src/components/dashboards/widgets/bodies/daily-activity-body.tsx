"use client";

import { useDashboardActivity } from "@/hooks/workspace/use-dashboards";
import type { IWidgetSettings } from "@/types";

import { ACTIVITY_SERIES } from "../chart/chart-series";
import { MetricChart } from "../chart/metric-chart";
import { useChartControls } from "../chart/use-chart-controls";

/**
 * GIN-163 / GIN-527 — Daily activity: what actually happened to work items.
 *
 * Created, updated and completed are all *events*, so a tall bar means a busy
 * day. Scheduled dates deliberately live in the Planned workload widget
 * instead: charting a target date beside a completion made planned work read as
 * delivered work, which is the misreading this widget was redesigned for.
 */
export function DailyActivityBody({
  workspaceSlug,
  settings,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  const controls = useChartControls(settings);
  const { data, isPending, isError } = useDashboardActivity(workspaceSlug, controls.params);

  return (
    <MetricChart
      workspaceSlug={workspaceSlug}
      settings={settings}
      series={ACTIVITY_SERIES}
      controls={controls}
      points={data?.daily ?? []}
      isPending={isPending}
      isError={isError}
      emptyMessage="No work-item activity in this window."
      errorMessage="Couldn't load activity."
    />
  );
}
