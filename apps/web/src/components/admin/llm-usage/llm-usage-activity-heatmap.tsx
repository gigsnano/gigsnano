"use client";

import { useRef } from "react";

import type { ILlmUsageDailyCell } from "@/types";

import { getHeatmapBucket, getHeatmapBucketVarName } from "./heatmap-buckets";
import type { TLlmUsageMetric } from "./llm-usage-mix-panel";

const CELL_COUNT = 26 * 7;
const DAY_MS = 86_400_000;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function dateToIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatReadableDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function metricValue(cell: ILlmUsageDailyCell | undefined, metric: TLlmUsageMetric) {
  if (!cell) return 0;
  return metric === "cost" ? cell.estimated_cost_usd : cell.total_tokens;
}

interface ILlmUsageActivityHeatmapProps {
  daily: ILlmUsageDailyCell[];
  metric: TLlmUsageMetric;
  selectedDate?: string | null;
  onSelectDate: (date: string | null) => void;
}

export function LlmUsageActivityHeatmap({
  daily,
  metric,
  selectedDate,
  onSelectDate,
}: ILlmUsageActivityHeatmapProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const map = new Map(daily.map((row) => [row.date, row]));
  const maxDate = daily.length > 0 ? new Date(`${daily[daily.length - 1]?.date ?? dateToIso(new Date())}T00:00:00.000Z`) : new Date();
  const end = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate(), 0, 0, 0, 0));
  const start = new Date(end.getTime() - (CELL_COUNT - 1) * DAY_MS);

  const cells: Array<{ date: string; cell?: ILlmUsageDailyCell; week: number; day: number }> = [];
  for (let i = 0; i < CELL_COUNT; i += 1) {
    const cursor = new Date(start.getTime() + i * DAY_MS);
    const date = dateToIso(cursor);
    const day = (cursor.getUTCDay() + 6) % 7;
    const week = Math.floor(i / 7);
    cells.push({ date, cell: map.get(date), week, day });
  }

  const monthTicks = new Map<number, string>();
  let previousMonth = -1;
  for (const item of cells) {
    if (item.day !== 0) continue;
    const month = new Date(`${item.date}T00:00:00.000Z`).getUTCMonth();
    if (month !== previousMonth) {
      monthTicks.set(item.week, MONTH_LABELS[month] ?? "");
      previousMonth = month;
    }
  }

  const values: number[] = [];
  for (const item of cells) {
    const value = metricValue(item.cell, metric);
    if (value > 0) values.push(value);
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium text-foreground">Activity heatmap</h2>
      <div className="mb-2 grid grid-cols-[auto_1fr] gap-x-2">
        <div />
        <div className="grid" style={{ gridTemplateColumns: "repeat(26, minmax(0, 1fr))" }}>
          {Array.from({ length: 26 }, (_, week) => (
            <span key={week} className="text-[10px] text-muted-foreground">
              {monthTicks.get(week) ?? ""}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-2">
        <div className="grid grid-rows-7 gap-[3px] pt-[1px]">
          {DAY_LABELS.map((day) => (
            <span key={day} className="h-3 text-[10px] text-muted-foreground">
              {day}
            </span>
          ))}
        </div>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(26, 12px)", gridTemplateRows: "repeat(7, 12px)" }}>
          {cells.map((item, index) => {
            const value = metricValue(item.cell, metric);
            const bucket = getHeatmapBucket(value, values);
            const selected = selectedDate === item.date;
            const labelValue = metric === "cost" ? `$${value.toFixed(4)}` : `${Math.round(value).toLocaleString()} tokens`;
            const ariaLabel = `${formatReadableDate(item.date)}: ${labelValue}, ${item.cell?.event_count ?? 0} events`;

            return (
              <button
                key={item.date}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                type="button"
                aria-label={ariaLabel}
                className="rounded-sm border border-border/30 outline-none ring-offset-background transition-transform motion-safe:hover:scale-[1.12] focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  gridColumn: item.week + 1,
                  gridRow: item.day + 1,
                  background:
                    value > 0
                      ? `var(${getHeatmapBucketVarName(bucket)})`
                      : "repeating-linear-gradient(45deg, var(--chart-scale-pattern-color), var(--chart-scale-pattern-color) 2px, transparent 2px, transparent 4px)",
                  boxShadow: selected ? "inset 0 0 0 1px var(--ring)" : undefined,
                }}
                onClick={() => onSelectDate(selected ? null : item.date)}
                onKeyDown={(event) => {
                  const moveBy =
                    event.key === "ArrowRight"
                      ? 7
                      : event.key === "ArrowLeft"
                        ? -7
                        : event.key === "ArrowDown"
                          ? 1
                          : event.key === "ArrowUp"
                            ? -1
                            : 0;
                  if (moveBy !== 0) {
                    event.preventDefault();
                    const next = index + moveBy;
                    const nextEl = refs.current[next];
                    if (nextEl) nextEl.focus();
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectDate(selected ? null : item.date);
                  }
                }}
                title={ariaLabel}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
