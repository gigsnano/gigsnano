import type { ILlmUsageSummary } from "@/types";

import { formatLlmUsageOperation, formatLlmUsageSource, formatTokenCount, formatUsd } from "./format-source";
import { LlmUsageHourGrid } from "./llm-usage-hour-grid";

export type TLlmUsageMetric = "tokens" | "cost";

interface ILlmUsageMixPanelProps {
  summary: ILlmUsageSummary | null | undefined;
  hourly: { dow: number; hour: number; total_tokens: number; event_count: number }[];
  metric: TLlmUsageMetric;
}

function valueOf(
  row: { tokens: number; cost_usd: number; count: number },
  metric: TLlmUsageMetric,
) {
  return metric === "cost" ? row.cost_usd : row.tokens;
}

export function LlmUsageMixPanel({ summary, hourly, metric }: ILlmUsageMixPanelProps) {
  const sourceRows = Object.entries(summary?.by_source ?? {});
  const operationRows = Object.entries(summary?.by_operation ?? {});
  const sourceMax = Math.max(1, ...sourceRows.map(([, row]) => valueOf(row, metric)));
  const operationMax = Math.max(1, ...operationRows.map(([, row]) => valueOf(row, metric)));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium text-foreground">Mix</h2>
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Sources</p>
        {sourceRows.map(([source, row]) => {
          const value = valueOf(row, metric);
          return (
            <div key={source}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{formatLlmUsageSource(source)}</span>
                <span className="text-muted-foreground">
                  {metric === "cost" ? formatUsd(value) : formatTokenCount(value)}
                </span>
              </div>
              <div className="h-2 rounded bg-muted">
                <div
                  className="h-2 rounded bg-primary/70"
                  style={{ width: `${Math.max(6, (value / sourceMax) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Operations</p>
        {operationRows.map(([operation, row]) => {
          const value = valueOf(row, metric);
          return (
            <div key={operation}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{formatLlmUsageOperation(operation)}</span>
                <span className="text-muted-foreground">
                  {metric === "cost" ? formatUsd(value) : formatTokenCount(value)}
                </span>
              </div>
              <div className="h-2 rounded bg-muted">
                <div
                  className="h-2 rounded bg-chart-2/80"
                  style={{ width: `${Math.max(6, (value / operationMax) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <LlmUsageHourGrid hourly={hourly} metric={metric} />
      </div>
    </section>
  );
}
