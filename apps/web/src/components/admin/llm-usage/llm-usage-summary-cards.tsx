import type { ILlmUsageSummary, ILlmUsageTimeseriesPoint } from "@/types";

import { formatTokenCount, formatUsd } from "./format-source";

function deltaLabel(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  return `${sign} ${Math.abs(value).toFixed(0)}%`;
}

function asSparkline(points: ILlmUsageTimeseriesPoint[]) {
  const values = points.map((point) => point.total_tokens);
  const max = Math.max(1, ...values);
  return (
    <div className="mt-2 flex items-end gap-0.5">
      {values.slice(-14).map((value, index) => (
        <span
          key={index}
          className="w-1 rounded-sm bg-primary/55"
          style={{ height: `${Math.max(3, (value / max) * 18)}px` }}
        />
      ))}
    </div>
  );
}

export function LlmUsageSummaryCards({
  summary,
  timeseries,
}: {
  summary: ILlmUsageSummary | null | undefined;
  timeseries: ILlmUsageTimeseriesPoint[];
}) {
  const avgTokens = summary?.event_count ? summary.total_tokens / summary.event_count : 0;
  const priorAvg =
    summary?.prior_period?.event_count && summary.prior_period.event_count > 0
      ? summary.prior_period.total_tokens / summary.prior_period.event_count
      : 0;
  const avgDelta = priorAvg > 0 ? ((avgTokens - priorAvg) / priorAvg) * 100 : null;
  const eventDelta =
    summary?.prior_period && summary.prior_period.event_count > 0
      ? ((summary.event_count - summary.prior_period.event_count) / summary.prior_period.event_count) * 100
      : null;

  const cards = [
    {
      label: "Total tokens",
      value: formatTokenCount(summary?.total_tokens ?? 0),
      delta: deltaLabel(summary?.prior_period?.delta_tokens_pct ?? null),
    },
    {
      label: "Est. cost",
      value: formatUsd(summary?.estimated_cost_usd ?? null),
      delta: deltaLabel(summary?.prior_period?.delta_cost_pct ?? null),
    },
    {
      label: "Avg tokens / event",
      value: formatTokenCount(avgTokens),
      delta: deltaLabel(avgDelta),
    },
    {
      label: "LLM events",
      value: formatTokenCount(summary?.event_count ?? 0),
      delta: deltaLabel(eventDelta),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="mt-1 text-xl font-semibold text-foreground">{card.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{card.delta} vs prior</p>
          {asSparkline(timeseries)}
        </article>
      ))}
    </div>
  );
}
