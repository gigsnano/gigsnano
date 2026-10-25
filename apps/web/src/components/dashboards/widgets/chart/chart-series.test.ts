import { describe, expect, it } from "vitest";

import { EChartBucket, EWidgetDateRange } from "@/types";

import {
  ACTIVITY_SERIES,
  CHART_PERIODS,
  DEFAULT_PERIOD,
  PLANNED_SERIES,
  excludeNonWorkingDays,
  integerTickCount,
  periodEnd,
  periodFor,
} from "./chart-series";

describe("chart series definitions", () => {
  it("keeps activity and planned metrics apart", () => {
    // GIN-527's whole point: a scheduled date is not something that happened.
    const activity = ACTIVITY_SERIES.map((s) => s.key);
    const planned = PLANNED_SERIES.map((s) => s.key);
    expect(activity).toEqual(["created", "updated", "completed"]);
    expect(planned).toEqual(["starting", "due", "overdue"]);
    expect(activity.filter((k) => planned.includes(k))).toEqual([]);
  });

  it("gives every series a label and a token-based colour", () => {
    for (const s of [...ACTIVITY_SERIES, ...PLANNED_SERIES]) {
      expect(s.label).toBeTruthy();
      // Design tokens only — a hardcoded hex would break one of the themes.
      expect(s.color).toMatch(/^var\(--/);
    }
  });

  it("only offers a drill-down where the filter vocabulary can express it", () => {
    const drill = (key: string) =>
      [...ACTIVITY_SERIES, ...PLANNED_SERIES].find((s) => s.key === key)?.drill;

    expect(drill("created")?.("2026-07-01", "2026-07-07")).toBe(
      "created:2026-07-01..2026-07-07",
    );
    expect(drill("due")?.("2026-07-01", "2026-07-07")).toBe("due:2026-07-01..2026-07-07");
    expect(drill("overdue")?.("2026-07-01", "2026-07-07")).toContain("status in (");
    // No `updated:`/`start:` field exists, so these must not fabricate a query.
    expect(drill("updated")).toBeNull();
    expect(drill("starting")).toBeNull();
  });
});

describe("periods", () => {
  it("draws every period the same way — columns", () => {
    // Counts are discrete; a line between two days draws values in between that
    // never happened. There is no per-period rendering choice left to get wrong.
    for (const period of CHART_PERIODS) {
      expect(period).not.toHaveProperty("kind");
    }
  });

  it("buckets a quarter by week so it isn't 90 points wide", () => {
    const byRange = Object.fromEntries(CHART_PERIODS.map((p) => [p.range, p]));
    expect(byRange[EWidgetDateRange.Last7].bucket).toBe(EChartBucket.Day);
    expect(byRange[EWidgetDateRange.Last30].bucket).toBe(EChartBucket.Day);
    expect(byRange[EWidgetDateRange.Last90].bucket).toBe(EChartBucket.Week);
  });

  it("falls back to the default for an unset or unsupported range", () => {
    expect(periodFor(undefined)).toBe(DEFAULT_PERIOD);
    expect(periodFor(EWidgetDateRange.All)).toBe(DEFAULT_PERIOD);
    expect(periodFor(EWidgetDateRange.Last7).range).toBe(EWidgetDateRange.Last7);
  });
});

describe("periodEnd", () => {
  it("a daily bucket covers only its own day", () => {
    expect(periodEnd("2026-07-15", EChartBucket.Day)).toBe("2026-07-15");
  });

  it("a weekly bucket covers the six days after its start", () => {
    expect(periodEnd("2026-07-13", EChartBucket.Week)).toBe("2026-07-19");
  });

  it("crosses a month boundary", () => {
    expect(periodEnd("2026-07-29", EChartBucket.Week)).toBe("2026-08-04");
  });
});

describe("excludeNonWorkingDays", () => {
  // 2026-07-13 is a Monday, so 18th/19th are Sat/Sun.
  const week = [
    "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16",
    "2026-07-17", "2026-07-18", "2026-07-19",
  ].map((date) => ({ date, created: 1 }));

  it("drops Saturday and Sunday from a daily chart", () => {
    expect(excludeNonWorkingDays(week, EChartBucket.Day).map((p) => p.date)).toEqual([
      "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17",
    ]);
  });

  it("leaves weekly buckets alone — a week contains its own weekend", () => {
    expect(excludeNonWorkingDays(week, EChartBucket.Week)).toHaveLength(7);
  });

  it("drops holidays when a calendar is supplied", () => {
    const kept = excludeNonWorkingDays(week, EChartBucket.Day, new Set(["2026-07-15"]));
    expect(kept.map((p) => p.date)).toEqual([
      "2026-07-13", "2026-07-14", "2026-07-16", "2026-07-17",
    ]);
  });

  it("classifies the weekend in UTC, not the machine's timezone", () => {
    // A local-time parse west of UTC reads this as Friday and would keep it.
    expect(excludeNonWorkingDays([{ date: "2026-07-18" }], EChartBucket.Day)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const input = [...week];
    excludeNonWorkingDays(input, EChartBucket.Day);
    expect(input).toHaveLength(7);
  });
});

describe("integerTickCount", () => {
  it("caps the tick request at the largest count so ticks land on integers", () => {
    // d3 asked for 5 ticks over 0..3 would hand back halves.
    expect(integerTickCount(3)).toBe(3);
    expect(integerTickCount(2)).toBe(2);
  });

  it("keeps the default ceiling once the data is bigger than it", () => {
    expect(integerTickCount(40)).toBe(5);
  });

  it("never drops below the two ticks an axis needs", () => {
    expect(integerTickCount(0)).toBe(2);
    expect(integerTickCount(1)).toBe(2);
  });
});
