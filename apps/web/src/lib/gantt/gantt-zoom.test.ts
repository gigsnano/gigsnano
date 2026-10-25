import { describe, it, expect } from "vitest";

import {
  GANTT_ZOOM_LEVELS,
  isCurrentPeriod,
  zoomConfig,
  type TGanttZoom,
} from "./gantt-zoom";

describe("gantt-zoom config (GIN-350)", () => {
  it("every zoom level has a multi-level header, coarse→fine top to bottom", () => {
    for (const z of GANTT_ZOOM_LEVELS) {
      const { scales, minColumnWidth } = zoomConfig(z);
      expect(scales.length).toBeGreaterThanOrEqual(2);
      expect(minColumnWidth).toBeGreaterThan(0);
      // Finer unit is never above a coarser one (year > quarter/month > week > day).
      const rank: Record<string, number> = { year: 5, quarter: 4, month: 3, week: 2, day: 1 };
      for (let i = 1; i < scales.length; i++) {
        expect(rank[scales[i].unit]).toBeLessThan(rank[scales[i - 1].unit]);
      }
    }
  });

  it("day zoom bottoms out on days; year zoom tops out on years", () => {
    expect(zoomConfig("day").scales.at(-1)?.unit).toBe("day");
    expect(zoomConfig("year").scales[0].unit).toBe("year");
  });

  it("quarter steps months by 3", () => {
    const month = zoomConfig("quarter").scales.find((s) => s.unit === "month");
    expect(month?.step).toBe(3);
  });

  it("falls back to week for an unknown level", () => {
    expect(zoomConfig("nope" as TGanttZoom)).toEqual(zoomConfig("week"));
  });
});

describe("isCurrentPeriod", () => {
  const now = new Date(2026, 6, 22, 14, 30); // 22 Jul 2026, mid-afternoon

  it("matches the day cell that contains now", () => {
    expect(isCurrentPeriod(new Date(2026, 6, 22), now, "day")).toBe(true);
    expect(isCurrentPeriod(new Date(2026, 6, 21), now, "day")).toBe(false);
    expect(isCurrentPeriod(new Date(2026, 6, 23), now, "day")).toBe(false);
  });

  it("matches the week cell that contains now", () => {
    // Week starting Mon 20 Jul covers the 22nd; the previous week does not.
    expect(isCurrentPeriod(new Date(2026, 6, 20), now, "week")).toBe(true);
    expect(isCurrentPeriod(new Date(2026, 6, 13), now, "week")).toBe(false);
  });

  it("matches the month cell that contains now", () => {
    expect(isCurrentPeriod(new Date(2026, 6, 1), now, "month")).toBe(true);
    expect(isCurrentPeriod(new Date(2026, 5, 1), now, "month")).toBe(false);
  });

  it("matches a stepped quarter cell, not just its first month", () => {
    // The quarter zoom steps months by 3, so the July cell also covers Aug+Sep.
    expect(isCurrentPeriod(new Date(2026, 6, 1), now, "month", 3)).toBe(true);
    expect(isCurrentPeriod(new Date(2026, 3, 1), now, "month", 3)).toBe(false);
    // ...and a September `now` still lands in that same July cell.
    const sept = new Date(2026, 8, 30);
    expect(isCurrentPeriod(new Date(2026, 6, 1), sept, "month", 3)).toBe(true);
  });

  it("matches the year cell that contains now", () => {
    expect(isCurrentPeriod(new Date(2026, 0, 1), now, "year")).toBe(true);
    expect(isCurrentPeriod(new Date(2025, 0, 1), now, "year")).toBe(false);
  });

  it("handles a month boundary without leaking into the next period", () => {
    const newYearsEve = new Date(2026, 11, 31, 23, 59);
    expect(isCurrentPeriod(new Date(2026, 11, 1), newYearsEve, "month")).toBe(true);
    expect(isCurrentPeriod(new Date(2027, 0, 1), newYearsEve, "month")).toBe(false);
  });
});
