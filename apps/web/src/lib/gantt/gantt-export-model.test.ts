import { describe, expect, it } from "vitest";

import { EGanttZoom } from "@/components/projects/views/gantt/gantt-config";
import { addDays, formatISODate } from "@/components/projects/views/gantt/gantt-date-math";
import { EStoryPriority, EStoryStatus, type IStory } from "@/types";
import { buildGanttExportModel } from "./gantt-export-model";

/** YYYY-MM-DD for `days` from today (UTC midnight) — keeps tests inside the
 *  padded chart range regardless of when they run. */
function isoFromToday(days: number): string {
  const n = new Date();
  const base = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  return formatISODate(addDays(base, days));
}

function story(partial: Partial<IStory>): IStory {
  return {
    id: partial.id ?? "s",
    workspace_slug: "ws",
    project_id: "p",
    cycle_id: null,
    module_id: null,
    parent_id: null,
    title: partial.title ?? "Task",
    description: "",
    status: partial.status ?? EStoryStatus.Todo,
    priority: partial.priority ?? EStoryPriority.None,
    start_date: partial.start_date ?? null,
    target_date: partial.target_date ?? null,
    order: 0,
    assignee_id: partial.assignee_id ?? null,
    ai_agent_id: null,
    label_id: null, label_ids: [],
    estimate_id: null,
    estimate_points: null,
    sub_issue_count: 0,
    bmad: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...partial,
  };
}

const resolvers = {
  getAssigneeName: (id: string | null) => (id === "u1" ? "Alice" : ""),
  getCode: (s: IStory) => s.code ?? `WEB-${s.id}`,
};

describe("buildGanttExportModel (Week zoom)", () => {
  const stories = [
    story({
      id: "1",
      title: "Spanning",
      status: EStoryStatus.InProgress,
      assignee_id: "u1",
      start_date: isoFromToday(0),
      target_date: isoFromToday(4), // inclusive 5-day span
    }),
    story({ id: "2", title: "Milestone", start_date: isoFromToday(10) }), // one date
    story({ id: "3", title: "Unscheduled" }), // no dates
  ];
  const model = buildGanttExportModel({ stories, zoom: EGanttZoom.Week, ...resolvers });

  it("keeps input order and one row per story", () => {
    expect(model.rows.map((r) => r.title)).toEqual(["Spanning", "Milestone", "Unscheduled"]);
  });

  it("computes an inclusive multi-day bar for a both-dates task", () => {
    const a = model.rows[0]!;
    expect(a.durationDays).toBe(5);
    expect(a.isMilestone).toBe(false);
    expect(a.barStartIndex).not.toBeNull();
    // 5-day inclusive span → end is 4 columns past the start in day granularity.
    expect(a.barEndIndex! - a.barStartIndex!).toBe(4);
    expect(a.assignee).toBe("Alice");
    expect(a.code).toBe("WEB-1");
    expect(a.progressPct).toBe(50);
  });

  it("renders a single-cell milestone for a one-date task, 10 days out", () => {
    const [a, b] = [model.rows[0]!, model.rows[1]!];
    expect(b.isMilestone).toBe(true);
    expect(b.barStartIndex).toBe(b.barEndIndex);
    expect(b.durationDays).toBeNull();
    // 10 calendar days later in day granularity == 10 columns right of the span start.
    expect(b.barStartIndex! - a.barStartIndex!).toBe(10);
  });

  it("leaves an undated task off the timeline", () => {
    const c = model.rows[2]!;
    expect(c.barStartIndex).toBeNull();
    expect(c.barEndIndex).toBeNull();
    expect(c.durationDays).toBeNull();
  });

  it("emits a day-granular axis whose month bands cover every column", () => {
    expect(model.granularity).toBe("day");
    expect(model.columns.length).toBeGreaterThan(0);
    const spanned = model.monthGroups.reduce((sum, g) => sum + g.span, 0);
    expect(spanned).toBe(model.columns.length);
  });
});

describe("buildGanttExportModel (Month zoom)", () => {
  const model = buildGanttExportModel({
    stories: [story({ id: "1", start_date: isoFromToday(0), target_date: isoFromToday(4) })],
    zoom: EGanttZoom.Month,
    ...resolvers,
  });

  it("collapses to a week-granular axis", () => {
    expect(model.granularity).toBe("week");
    const spanned = model.monthGroups.reduce((sum, g) => sum + g.span, 0);
    expect(spanned).toBe(model.columns.length);
    // A 5-day task collapses to at most two week columns (it can straddle one
    // week boundary depending on which weekday "today" is, but never three weeks).
    const a = model.rows[0]!;
    expect(a.barEndIndex! - a.barStartIndex!).toBeLessThanOrEqual(1);
  });
});
