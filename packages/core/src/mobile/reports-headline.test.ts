import { describe, expect, it } from "vitest";

import type { IReports } from "../types/reports";
import { formatDelta, pctDelta, reportsHeadline } from "./reports-headline";

function reports(over: { total?: number; pct?: number | null; atRisk?: number; offTrack?: number }): IReports {
  return {
    range: "7d",
    period_from: "2026-10-10",
    period_to: "2026-10-17",
    bucket: "day",
    throughput: { total: over.total ?? 0, previous_total: 0, buckets: [] },
    on_time: { done_with_target: 0, on_time: 0, pct: over.pct === undefined ? null : over.pct, previous_pct: null },
    at_risk: { at_risk: over.atRisk ?? 0, off_track: over.offTrack ?? 0, total_projects: 5 },
    team_load: [],
    cycles: [],
  };
}

describe("reportsHeadline", () => {
  it("joins done, on-time and at-risk", () => {
    expect(reportsHeadline(reports({ total: 18, pct: 82, atRisk: 2, offTrack: 1 }))).toBe(
      "18 done · 82% on time · 3 at risk",
    );
  });
  it("says on-time n/a when pct is null", () => {
    expect(reportsHeadline(reports({ total: 4, pct: null }))).toBe("4 done · on-time n/a · 0 at risk");
  });
  it("keeps a real 0% on time", () => {
    expect(reportsHeadline(reports({ total: 1, pct: 0 }))).toBe("1 done · 0% on time · 0 at risk");
  });
});

describe("pctDelta", () => {
  it("is null when the previous value is 0", () => {
    expect(pctDelta(5, 0)).toBeNull();
  });
  it("rounds the percent change", () => {
    expect(pctDelta(112, 100)).toBe(12);
    expect(pctDelta(95, 100)).toBe(-5);
    expect(pctDelta(3, 3)).toBe(0);
  });
});

describe("formatDelta", () => {
  it("formats up, down and none", () => {
    expect(formatDelta(12)).toBe("↑12%");
    expect(formatDelta(-5)).toBe("↓5%");
    expect(formatDelta(0)).toBe("—");
    expect(formatDelta(null)).toBe("—");
  });
});
