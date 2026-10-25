import { describe, expect, it } from "vitest";

import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

import { calendarGridStart, toDayKey, CALENDAR_CELLS } from "./calendar-grid";
import { placeBySpan, spanRange } from "./calendar-span";

function story(overrides: Partial<IStory> & Pick<IStory, "id">): IStory {
  return {
    workspace_slug: "acme",
    project_id: "proj-1",
    cycle_id: null,
    module_id: null,
    parent_id: null,
    title: overrides.id,
    description: "",
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    start_date: null,
    target_date: null,
    order: 1,
    assignee_id: null,
    ai_agent_id: null,
    label_ids: [],
    label_id: null,
    estimate_id: null,
    estimate_points: null,
    sub_issue_count: 0,
    bmad: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** The 42 day keys of August 2026's grid: Sun 2026-07-26 … Sat 2026-09-05. */
const gridDays = (() => {
  const start = calendarGridStart("2026-08");
  return Array.from({ length: CALENDAR_CELLS }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toDayKey(d);
  });
})();

describe("spanRange", () => {
  it("runs start → due when both exist", () => {
    expect(spanRange(story({ id: "a", start_date: "2026-08-03", target_date: "2026-08-07" })))
      .toEqual({ from: "2026-08-03", to: "2026-08-07" });
  });

  it("is a single day when only one date exists", () => {
    expect(spanRange(story({ id: "a", target_date: "2026-08-07" })))
      .toEqual({ from: "2026-08-07", to: "2026-08-07" });
    expect(spanRange(story({ id: "b", start_date: "2026-08-03" })))
      .toEqual({ from: "2026-08-03", to: "2026-08-03" });
  });

  it("is null when the item has no dates", () => {
    expect(spanRange(story({ id: "a" }))).toBeNull();
  });

  it("survives a due date before the start date rather than inverting", () => {
    // Bad data shouldn't render a negative-width bar; clamp to a single day.
    expect(spanRange(story({ id: "a", start_date: "2026-08-07", target_date: "2026-08-03" })))
      .toEqual({ from: "2026-08-07", to: "2026-08-07" });
  });
});

describe("placeBySpan", () => {
  it("returns one entry per week row", () => {
    expect(placeBySpan([], gridDays, 3)).toHaveLength(6);
  });

  it("places a within-week span as one segment spanning its columns", () => {
    // Mon 2026-08-03 → Wed 2026-08-05, in the week starting Sun 2026-08-02.
    const rows = placeBySpan(
      [story({ id: "a", start_date: "2026-08-03", target_date: "2026-08-05" })],
      gridDays,
      3,
    );
    const withSegments = rows.filter((r) => r.segments.length > 0);
    expect(withSegments).toHaveLength(1);
    const seg = withSegments[0]!.segments[0]!;
    expect(seg.startCol).toBe(1); // Monday
    expect(seg.endCol).toBe(3); // Wednesday
    expect(seg.continuesLeft).toBe(false);
    expect(seg.continuesRight).toBe(false);
  });

  it("splits a span across a week boundary and flags the joins", () => {
    // Fri 2026-08-07 → Tue 2026-08-11 crosses Sat→Sun.
    const rows = placeBySpan(
      [story({ id: "a", start_date: "2026-08-07", target_date: "2026-08-11" })],
      gridDays,
      3,
    );
    const segs = rows.flatMap((r) => r.segments);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startCol: 5, endCol: 6, continuesLeft: false, continuesRight: true });
    expect(segs[1]).toMatchObject({ startCol: 0, endCol: 2, continuesLeft: true, continuesRight: false });
  });

  it("clips a span that starts before or ends after the grid", () => {
    const rows = placeBySpan(
      [story({ id: "a", start_date: "2026-01-01", target_date: "2026-12-31" })],
      gridDays,
      3,
    );
    const segs = rows.flatMap((r) => r.segments);
    expect(segs).toHaveLength(6); // one per week row, full width
    expect(segs[0]).toMatchObject({ startCol: 0, endCol: 6, continuesLeft: true });
    expect(segs[5]).toMatchObject({ startCol: 0, endCol: 6, continuesRight: true });
  });

  it("packs overlapping spans into separate lanes", () => {
    const rows = placeBySpan(
      [
        story({ id: "a", start_date: "2026-08-03", target_date: "2026-08-05" }),
        story({ id: "b", start_date: "2026-08-04", target_date: "2026-08-06" }),
      ],
      gridDays,
      3,
    );
    const segs = rows.flatMap((r) => r.segments);
    expect(segs.map((s) => s.lane)).toEqual([0, 1]);
  });

  it("reuses a lane when spans do not overlap", () => {
    const rows = placeBySpan(
      [
        story({ id: "a", start_date: "2026-08-03", target_date: "2026-08-04" }),
        story({ id: "b", start_date: "2026-08-05", target_date: "2026-08-06" }),
      ],
      gridDays,
      3,
    );
    const segs = rows.flatMap((r) => r.segments);
    expect(segs.map((s) => s.lane)).toEqual([0, 0]);
  });

  it("counts what a lane cap hid rather than dropping it silently", () => {
    const stories = Array.from({ length: 5 }, (_, i) =>
      story({ id: `s${i}`, start_date: "2026-08-03", target_date: "2026-08-05" }),
    );
    const rows = placeBySpan(stories, gridDays, 3);
    const row = rows.find((r) => r.segments.length > 0)!;
    expect(row.segments).toHaveLength(3);
    expect(row.hiddenCount).toBe(2);
  });

  it("omits an undated item entirely", () => {
    const rows = placeBySpan([story({ id: "a" })], gridDays, 3);
    expect(rows.flatMap((r) => r.segments)).toHaveLength(0);
  });

  it("orders segments by start day so lanes are stable between renders", () => {
    const rows = placeBySpan(
      [
        story({ id: "later", start_date: "2026-08-05", target_date: "2026-08-06" }),
        story({ id: "earlier", start_date: "2026-08-03", target_date: "2026-08-06" }),
      ],
      gridDays,
      3,
    );
    const segs = rows.flatMap((r) => r.segments);
    expect(segs[0]!.story.id).toBe("earlier");
    expect(segs[0]!.lane).toBe(0);
    expect(segs[1]!.lane).toBe(1);
  });
});
