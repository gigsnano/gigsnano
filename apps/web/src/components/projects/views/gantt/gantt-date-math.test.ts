import { describe, it, expect } from "vitest";

import {
  getTimelineBarPosition,
  getTimelineDragPatch,
  formatISODate,
  addDays,
} from "./gantt-date-math";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

describe("getTimelineBarPosition", () => {
  const chartStart = day("2026-07-06"); // Monday
  const dayWidth = 60;

  it("spans both dates inclusively", () => {
    const pos = getTimelineBarPosition(
      { start_date: "2026-07-06", target_date: "2026-07-08" },
      chartStart,
      dayWidth,
    );
    expect(pos).toEqual({ left: 0, width: 180 });
  });

  it("uses fixed 60px half-block for start-only", () => {
    const pos = getTimelineBarPosition(
      { start_date: "2026-07-07", target_date: null },
      chartStart,
      dayWidth,
      60,
    );
    expect(pos).toEqual({ left: 60, width: 60 });
  });

  it("anchors target-only so the right edge ends on the due day", () => {
    const pos = getTimelineBarPosition(
      { start_date: null, target_date: "2026-07-07" },
      chartStart,
      dayWidth,
      60,
    );
    // target at day 1 → left = 60 - 60 + 60 = 60
    expect(pos).toEqual({ left: 60, width: 60 });
  });
});

describe("getTimelineDragPatch", () => {
  const chartStart = day("2026-07-06");
  const dayWidth = 60;

  it("writes both dates when completing a half-block via the missing edge", () => {
    // start-only: right-resize completes the block
    const patch = getTimelineDragPatch({
      leftPx: 0,
      widthPx: 120,
      chartStart,
      dayWidth,
      hadStart: true,
      hadTarget: false,
      dragMode: "right",
    });
    expect(patch).toEqual({
      start_date: "2026-07-06",
      target_date: "2026-07-07",
    });
  });

  it("updates only start when left-resizing a start-only half-block", () => {
    const patch = getTimelineDragPatch({
      leftPx: 60,
      widthPx: 60,
      chartStart,
      dayWidth,
      hadStart: true,
      hadTarget: false,
      dragMode: "left",
    });
    expect(patch.start_date).toBe("2026-07-07");
    expect(patch.target_date).toBeUndefined();
  });
});

describe("formatISODate / addDays", () => {
  it("formats UTC dates as YYYY-MM-DD", () => {
    expect(formatISODate(addDays(day("2026-07-06"), 1))).toBe("2026-07-07");
  });
});
