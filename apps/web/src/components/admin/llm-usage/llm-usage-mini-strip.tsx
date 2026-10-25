import type { ILlmUsageDailyCell } from "@/types";

import { getHeatmapBucket, getHeatmapBucketVarName } from "./heatmap-buckets";
import type { TLlmUsageMetric } from "./llm-usage-mix-panel";

export function LlmUsageMiniStrip({
  days,
  metric,
}: {
  days: ILlmUsageDailyCell[];
  metric: TLlmUsageMetric;
}) {
  const rows =
    days.length > 0
      ? days
      : Array.from({ length: 7 }, (_, index) => ({
          date: `empty-${index}`,
          total_tokens: 0,
          estimated_cost_usd: 0,
          event_count: 0,
        }));
  const values = rows.map((day) => (metric === "cost" ? day.estimated_cost_usd : day.total_tokens));
  const positives = values.filter((value) => value > 0);

  return (
    <div className="flex items-center gap-1">
      {rows.map((day) => {
        const value = metric === "cost" ? day.estimated_cost_usd : day.total_tokens;
        const bucket = getHeatmapBucket(value, positives);
        return (
          <span
            key={day.date}
            className="block size-2 rounded-[2px] border border-border/30"
            style={{
              background:
                value > 0
                  ? `var(${getHeatmapBucketVarName(bucket)})`
                  : "repeating-linear-gradient(45deg, var(--chart-scale-pattern-color), var(--chart-scale-pattern-color) 2px, transparent 2px, transparent 4px)",
            }}
            title={`${day.date} · ${Math.round(value).toLocaleString()} ${metric === "cost" ? "USD" : "tokens"}`}
          />
        );
      })}
    </div>
  );
}
