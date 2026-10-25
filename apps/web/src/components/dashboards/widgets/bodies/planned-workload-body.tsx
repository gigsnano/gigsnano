"use client";

import { usePlannedWorkload } from "@/hooks/workspace/use-dashboards";
import type { IWidgetSettings } from "@/types";

import { PLANNED_SERIES } from "../chart/chart-series";
import { MetricChart } from "../chart/metric-chart";
import { useChartControls } from "../chart/use-chart-controls";

/**
 * GIN-527 — Planned workload: what work is *scheduled*, not what happened.
 *
 * Starting and due are dates the item carries; overdue is the subset that is
 * past due and still open. Split out of Daily activity so a wave of newly-filed
 * work with target dates can't be read as delivery, and so a real overdue tail
 * isn't buried under a much larger created series.
 */
export function PlannedWorkloadBody({
  workspaceSlug,
  settings,
}: {
  workspaceSlug: string;
  settings?: IWidgetSettings;
}) {
  const controls = useChartControls(settings);
  const { data, isPending, isError } = usePlannedWorkload(workspaceSlug, controls.params);

  return (
    <MetricChart
      workspaceSlug={workspaceSlug}
      settings={settings}
      series={PLANNED_SERIES}
      controls={controls}
      points={data?.daily ?? []}
      isPending={isPending}
      isError={isError}
      emptyMessage="Nothing scheduled in this window."
      errorMessage="Couldn't load planned workload."
    />
  );
}
