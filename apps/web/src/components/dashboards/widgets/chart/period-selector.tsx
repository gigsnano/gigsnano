"use client";

import { cn } from "@/lib/utils";
import type { EWidgetDateRange } from "@/types";

import { CHART_PERIODS } from "./chart-series";

/**
 * 7 / 30 / 90-day switch for a chart widget (GIN-527).
 *
 * A sliding indicator rather than three independently-styled buttons, so the
 * change of period reads as one control moving instead of two things blinking.
 */
export function PeriodSelector({
  value,
  onChange,
}: {
  value: EWidgetDateRange;
  onChange: (range: EWidgetDateRange) => void;
}) {
  const index = Math.max(
    0,
    CHART_PERIODS.findIndex((p) => p.range === value),
  );

  return (
    <div
      role="group"
      aria-label="Chart period"
      className="relative flex shrink-0 items-center rounded-md bg-muted p-0.5"
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 rounded-[5px] bg-background shadow-sm transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 4px) / ${CHART_PERIODS.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {CHART_PERIODS.map((period) => (
        <button
          key={period.range}
          type="button"
          aria-pressed={period.range === value}
          onClick={() => onChange(period.range)}
          className={cn(
            "relative z-10 rounded-[5px] px-2 py-0.5 text-[11px] font-medium transition-colors duration-150",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            period.range === value
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
