"use client";

import { cn } from "@/lib/utils";

import type { IChartSeries } from "./chart-series";

/**
 * The chart's legend, doubling as its series toggle (GIN-527).
 *
 * Hiding a series removes it from the chart entirely, which is what makes the
 * y-axis rescale: the domain is derived from the series actually drawn, so a
 * small series stops being flattened by a large one the moment the large one is
 * switched off.
 */
export function ChartLegend({
  series,
  hidden,
  onToggle,
}: {
  series: readonly IChartSeries[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <ul className="flex shrink-0 flex-wrap items-center justify-center gap-x-1 gap-y-1 px-3 pt-2 pb-2.5">
      {series.map((entry) => {
        const off = hidden.has(entry.key);
        return (
          <li key={entry.key}>
            <button
              type="button"
              aria-pressed={!off}
              onClick={() => onToggle(entry.key)}
              className={cn(
                "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] transition-colors duration-150",
                "hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                off ? "text-muted-foreground/50" : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full transition-opacity duration-150",
                  off && "opacity-30",
                )}
                style={{ backgroundColor: entry.color }}
              />
              <span className={cn(off && "line-through")}>{entry.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
