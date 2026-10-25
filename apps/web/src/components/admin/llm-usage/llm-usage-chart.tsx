"use client";

import type { ILlmUsageTimeseriesPoint } from "@/types";
import { Area, ChartTooltip, ComposedChart, Grid, Line, XAxis, YAxis } from "@/components/charts";

import { formatUsd } from "./format-source";

interface ILlmUsageChartProps {
  points: ILlmUsageTimeseriesPoint[];
  selectedDate?: string | null;
}

export function LlmUsageChart({ points, selectedDate }: ILlmUsageChartProps) {
  const chartData = points.map((point) => ({
    ...point,
    selected: point.date === selectedDate ? point.total_tokens : null,
  })) as unknown as Record<string, unknown>[];

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Daily trend</h2>
        {selectedDate ? <p className="text-xs text-muted-foreground">Selected: {selectedDate}</p> : null}
      </div>
      <ComposedChart data={chartData} xDataKey="date" aspectRatio="16 / 5">
        <Grid horizontal />
        <Area dataKey="total_tokens" fill="var(--chart-1)" fillOpacity={0.2} stroke="var(--chart-1)" />
        <Line dataKey="estimated_cost_usd" yAxisId="right" stroke="var(--chart-3)" strokeWidth={2} />
        <Line dataKey="selected" stroke="var(--ring)" strokeWidth={2.5} showMarkers />
        <XAxis numTicks={8} />
        <YAxis />
        <YAxis yAxisId="right" orientation="right" formatLargeNumbers={false} formatValue={(value) => formatUsd(value)} />
        <ChartTooltip />
      </ComposedChart>
    </section>
  );
}
