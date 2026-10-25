import type { ILlmUsageHourlyCell } from "@/types";

import { getHeatmapBucket, getHeatmapBucketVarName } from "./heatmap-buckets";
import type { TLlmUsageMetric } from "./llm-usage-mix-panel";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface ILlmUsageHourGridProps {
  hourly: ILlmUsageHourlyCell[];
  metric: TLlmUsageMetric;
}

export function LlmUsageHourGrid({ hourly, metric }: ILlmUsageHourGridProps) {
  const metricLabel = metric === "cost" ? "cost-proxy tokens" : "tokens";
  const cells = hourly.map((cell) => ({
    ...cell,
    value: cell.total_tokens,
  }));
  const values: number[] = [];
  for (const cell of cells) {
    if (cell.value > 0) values.push(cell.value);
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Hour grid (UTC)</p>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <div className="grid grid-rows-7 gap-[2px] pt-[1px]">
          {DAY_LABELS.map((label) => (
            <span key={label} className="h-2 text-[10px] text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(24, 8px)", gridTemplateRows: "repeat(7, 8px)" }}>
          {cells.map((cell) => {
            const bucket = getHeatmapBucket(cell.value, values);
            return (
              <div
                key={`${cell.dow}-${cell.hour}`}
                className="rounded-[2px] border border-border/20"
                style={{
                  gridColumn: cell.hour + 1,
                  gridRow: cell.dow + 1,
                  background:
                    cell.value > 0
                      ? `var(${getHeatmapBucketVarName(bucket)})`
                      : "repeating-linear-gradient(45deg, var(--chart-scale-pattern-color), var(--chart-scale-pattern-color) 2px, transparent 2px, transparent 4px)",
                }}
                title={`${DAY_LABELS[cell.dow]} ${cell.hour}:00 - ${Math.round(cell.value).toLocaleString()} ${metricLabel}`}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  );
}
