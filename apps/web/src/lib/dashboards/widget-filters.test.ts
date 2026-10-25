import { describe, expect, it } from "vitest";

import {
  EChartBucket,
  EStoryStatus,
  EStoryPriority,
  EWidgetDateRange,
  EWidgetGroupBy,
} from "@/types";
import type { IStory } from "@/types";

import {
  applyDashboardFilters,
  chartWindow,
  dashboardWindow,
  filterStories,
  groupStories,
  resolveDateRange,
  toMetricsParams,
} from "./widget-filters";

const story = (over: Partial<IStory>): IStory =>
  ({
    id: "s",
    project_id: "p1",
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    assignee_id: null,
    ...over,
  }) as IStory;

const items = [
  story({ id: "a", project_id: "p1", status: EStoryStatus.Todo, priority: EStoryPriority.High, assignee_id: "u1" }),
  story({ id: "b", project_id: "p2", status: EStoryStatus.Done, priority: EStoryPriority.Low, assignee_id: "u1" }),
  story({ id: "c", project_id: "p1", status: EStoryStatus.Done, priority: EStoryPriority.High, assignee_id: null }),
];

describe("filterStories", () => {
  it("returns all when no settings", () => {
    expect(filterStories(items)).toHaveLength(3);
  });
  it("filters by project", () => {
    expect(filterStories(items, { project_id: "p1" }).map((s) => s.id)).toEqual(["a", "c"]);
  });
  it("filters by assignee + status together (AND)", () => {
    expect(
      filterStories(items, { assignee_id: "u1", status: EStoryStatus.Done }).map((s) => s.id),
    ).toEqual(["b"]);
  });
  it("empty-string filters mean all", () => {
    expect(filterStories(items, { project_id: "" })).toHaveLength(3);
  });
});

describe("groupStories", () => {
  it("single group when none", () => {
    const g = groupStories(items, EWidgetGroupBy.None);
    expect(g).toHaveLength(1);
    expect(g[0].items).toHaveLength(3);
  });
  it("groups by status", () => {
    const g = groupStories(items, EWidgetGroupBy.Status);
    const done = g.find((x) => x.key === EStoryStatus.Done);
    expect(done?.items.map((s) => s.id)).toEqual(["b", "c"]);
  });
  it("buckets null assignee as 'unassigned'", () => {
    const g = groupStories(items, EWidgetGroupBy.Assignee);
    expect(g.find((x) => x.key === "unassigned")?.items.map((s) => s.id)).toEqual(["c"]);
  });
});

// --- GIN-160: date window ------------------------------------------------------

// A fixed "now" so preset maths is deterministic. Local noon, so the local-day
// derivation can't be nudged across a boundary by the runner's timezone.
const NOW = new Date(2026, 6, 17, 12, 0, 0); // 2026-07-17

describe("resolveDateRange", () => {
  it("returns an empty window for All (absent params = all time server-side)", () => {
    expect(resolveDateRange({ date_range: EWidgetDateRange.All }, NOW)).toEqual({});
    expect(resolveDateRange({}, NOW)).toEqual({}); // unset defaults to All
    expect(resolveDateRange(undefined, NOW)).toEqual({});
  });

  it("counts presets inclusive of today", () => {
    // 7d spans today + the 6 before it, not today - 7.
    expect(resolveDateRange({ date_range: EWidgetDateRange.Last7 }, NOW)).toEqual({
      date_from: "2026-07-11",
      date_to: "2026-07-17",
    });
    expect(resolveDateRange({ date_range: EWidgetDateRange.Last30 }, NOW)).toEqual({
      date_from: "2026-06-18",
      date_to: "2026-07-17",
    });
  });

  it("crosses month and year boundaries", () => {
    expect(
      resolveDateRange({ date_range: EWidgetDateRange.Last30 }, new Date(2027, 0, 5, 12)),
    ).toEqual({ date_from: "2026-12-07", date_to: "2027-01-05" });
  });

  it("passes custom dates through verbatim", () => {
    expect(
      resolveDateRange(
        { date_range: EWidgetDateRange.Custom, date_from: "2026-01-01", date_to: "2026-02-01" },
        NOW,
      ),
    ).toEqual({ date_from: "2026-01-01", date_to: "2026-02-01" });
  });

  it("treats a half-set custom range as unbounded on the missing end", () => {
    expect(
      resolveDateRange({ date_range: EWidgetDateRange.Custom, date_from: "2026-01-01" }, NOW),
    ).toEqual({ date_from: "2026-01-01", date_to: undefined });
  });

  it("ignores stale custom dates when a preset is selected", () => {
    // Switching Custom -> 7d must not leak the old bounds into the query.
    expect(
      resolveDateRange(
        { date_range: EWidgetDateRange.Last7, date_from: "2020-01-01", date_to: "2020-01-02" },
        NOW,
      ),
    ).toEqual({ date_from: "2026-07-11", date_to: "2026-07-17" });
  });
});

describe("toMetricsParams", () => {
  it("carries the resolved window alongside the plain filters", () => {
    expect(
      toMetricsParams({ project_id: "p1", date_range: EWidgetDateRange.Last7 }),
    ).toMatchObject({ project_id: "p1" });
    const params = toMetricsParams({ date_range: EWidgetDateRange.Custom, date_from: "2026-05-01" });
    expect(params.date_from).toBe("2026-05-01");
  });

  it("drops group_by (the endpoint has no such param)", () => {
    expect(toMetricsParams({ group_by: EWidgetGroupBy.Status })).not.toHaveProperty("group_by");
  });
});

describe("filterStories date window", () => {
  const dated = [
    story({ id: "old", created_at: "2026-07-01T10:00:00Z" } as Partial<IStory>),
    story({ id: "edge", created_at: "2026-07-11T00:30:00Z" } as Partial<IStory>),
    story({ id: "new", created_at: "2026-07-17T09:00:00Z" } as Partial<IStory>),
  ];

  it("keeps only items created inside the preset window", () => {
    expect(
      filterStories(dated, { date_range: EWidgetDateRange.Last7 }, NOW).map((s) => s.id),
    ).toEqual(["edge", "new"]);
  });

  it("includes items created on the date_to day itself", () => {
    // A same-day item must not be excluded by a date-only upper bound.
    expect(
      filterStories(
        dated,
        { date_range: EWidgetDateRange.Custom, date_from: "2026-07-17", date_to: "2026-07-17" },
        NOW,
      ).map((s) => s.id),
    ).toEqual(["new"]);
  });

  it("All keeps everything", () => {
    expect(filterStories(dated, { date_range: EWidgetDateRange.All }, NOW)).toHaveLength(3);
  });
});

describe("dashboard-wide filter", () => {
  const TODAY = new Date(2026, 6, 17); // 2026-07-17, local

  it("leaves params alone when there is no filter or it is empty", () => {
    const params = { project_id: "p1", date_from: "2026-01-01" };
    expect(applyDashboardFilters(params, null)).toBe(params);
    expect(applyDashboardFilters(params, { project_ids: [] }, TODAY)).toEqual(params);
    expect(
      applyDashboardFilters(params, { date_range: EWidgetDateRange.All }, TODAY),
    ).toEqual(params);
  });

  it("adds the project list beside the widget's own project", () => {
    expect(
      applyDashboardFilters(
        { project_id: "p1" } as Parameters<typeof applyDashboardFilters>[0],
        { project_ids: ["p1", "p2"] },
        TODAY,
      ),
    ).toEqual({ project_id: "p1", project_ids: "p1,p2" });
  });

  it("replaces the widget's window with the dashboard's", () => {
    expect(
      applyDashboardFilters(
        { date_from: "2020-01-01", date_to: "2020-02-01" },
        { date_range: EWidgetDateRange.Last7 },
        TODAY,
      ),
    ).toEqual({ date_from: "2026-07-11", date_to: "2026-07-17" });
    // An open-ended custom range clears the widget's other end too.
    expect(
      applyDashboardFilters(
        { date_from: "2020-01-01", date_to: "2020-02-01" },
        { date_range: EWidgetDateRange.Custom, date_from: "2026-05-01" },
        TODAY,
      ),
    ).toEqual({ date_from: "2026-05-01", date_to: undefined });
  });

  it("reports no window for All time", () => {
    expect(dashboardWindow({ date_range: EWidgetDateRange.All })).toBeNull();
    expect(dashboardWindow(undefined)).toBeNull();
  });

  it("fits a window to the chart endpoints", () => {
    expect(chartWindow({ date_from: "2026-07-11", date_to: "2026-07-17" }, TODAY)).toEqual({
      date_from: "2026-07-11",
      date_to: "2026-07-17",
      bucket: EChartBucket.Day,
    });
    // Past a month buckets weekly; past a year clamps to the server's cap.
    expect(chartWindow({ date_from: "2020-01-01", date_to: "2026-07-17" }, TODAY)).toEqual({
      date_from: "2025-07-17",
      date_to: "2026-07-17",
      bucket: EChartBucket.Week,
    });
    // Missing ends fill the way the server would: today, and 30 days back.
    expect(chartWindow({}, TODAY)).toEqual({
      date_from: "2026-06-18",
      date_to: "2026-07-17",
      bucket: EChartBucket.Day,
    });
  });
});
