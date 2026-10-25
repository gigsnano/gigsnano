import { describe, expect, it } from "vitest";

import { EStoryPriority, EStoryStatus } from "@/types";
import { EMPTY_ISSUE_FILTERS } from "@/store/ui/issues-view.store";

import { buildFilterPills, compactGigsqlLabel } from "./filter-pills";

describe("buildFilterPills", () => {
  it("returns one pill per active simple facet", () => {
    const pills = buildFilterPills({
      ...EMPTY_ISSUE_FILTERS,
      status: [EStoryStatus.Todo, EStoryStatus.InProgress],
      priority: [EStoryPriority.High],
      title: "auth",
    });

    expect(pills).toHaveLength(3);
    expect(pills.map((p) => p.id)).toEqual(["status", "priority", "title"]);
  });

  it("collapses OR expressions into a single GigsQL pill", () => {
    const query = "assignee = me OR assignee is null";
    const pills = buildFilterPills(EMPTY_ISSUE_FILTERS, query);

    expect(pills).toEqual([{ id: "gigsql", label: query }]);
  });

  it("expands representable canonical GigsQL into facet pills", () => {
    const query = "status = todo AND priority = high";
    const pills = buildFilterPills(EMPTY_ISSUE_FILTERS, query);

    expect(pills.map((p) => p.id)).toEqual(["status", "priority"]);
  });
});

describe("compactGigsqlLabel", () => {
  it("truncates long queries for pill display", () => {
    const long = "status = todo AND ".repeat(10);
    expect(compactGigsqlLabel(long).endsWith("…")).toBe(true);
    expect(compactGigsqlLabel(long).length).toBeLessThanOrEqual(48);
  });
});
