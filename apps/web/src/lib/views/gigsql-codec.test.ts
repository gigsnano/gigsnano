import { describe, expect, it } from "vitest";

import { EStoryPriority, EStoryStatus, EStoryType } from "@/types";
import { EMPTY_ISSUE_FILTERS, type IIssueFilters } from "@/store/ui/issues-view.store";

import { filtersToGigsql, gigsqlToFilters, filtersToRows, rowsToGigsql, gigsqlToRows } from "./gigsql-codec";

const EMPTY: IIssueFilters = EMPTY_ISSUE_FILTERS;

describe("filtersToGigsql", () => {
  it("returns empty string for empty filters", () => {
    expect(filtersToGigsql(EMPTY)).toBe("");
  });

  it("emits canonical syntax for multi status + priority", () => {
    const f: IIssueFilters = {
      ...EMPTY,
      status: [EStoryStatus.Todo, EStoryStatus.InProgress],
      priority: [EStoryPriority.High],
    };
    const q = filtersToGigsql(f);
    expect(q).toBe("status in (todo, in_progress) AND priority = high");
    expect(gigsqlToFilters(q)?.status).toEqual([EStoryStatus.Todo, EStoryStatus.InProgress]);
    expect(gigsqlToFilters(q)?.priority).toEqual([EStoryPriority.High]);
  });

  it("encodes due range as between", () => {
    expect(
      filtersToGigsql({ ...EMPTY, dueFrom: "2026-07-01", dueTo: "2026-07-31" }),
    ).toBe("dueDate between 2026-07-01 and 2026-07-31");
  });

  it("encodes single-sided due and created dates", () => {
    expect(filtersToGigsql({ ...EMPTY, dueFrom: "2026-07-15" })).toBe("dueDate = 2026-07-15");
    expect(filtersToGigsql({ ...EMPTY, createdTo: "2026-06-30" })).toBe("createdAt = 2026-06-30");
  });

  it("encodes assignee, label, and title facets", () => {
    const q = filtersToGigsql({
      ...EMPTY,
      assignee: ["me", "u1"],
      label: ["lbl-1"],
      title: "login",
    });
    expect(q).toBe("assignee in (me, u1) AND label = lbl-1 AND title ~ login");
  });

  it("does not encode store-only type or custom facets", () => {
    const q = filtersToGigsql({
      ...EMPTY,
      status: [EStoryStatus.Todo],
      type: [EStoryType.Story],
      custom: { cf1: ["a"] },
    });
    expect(q).toBe("status = todo");
  });
});

describe("gigsqlToFilters", () => {
  it("returns empty filters for blank query", () => {
    expect(gigsqlToFilters("")).toEqual(EMPTY);
    expect(gigsqlToFilters("   ")).toEqual(EMPTY);
  });

  it("returns null for unsupported queries", () => {
    expect(gigsqlToFilters("sprint_zero:incomplete")).toBeNull();
    expect(gigsqlToFilters("status:bad-value")).toBeNull();
    expect(gigsqlToFilters("assignee = me OR assignee is null")).toBeNull();
  });

  it("decodes canonical created range and title", () => {
    expect(
      gigsqlToFilters("createdAt between 2026-07-01 and 2026-07-31 AND title ~ auth"),
    ).toEqual({
      ...EMPTY,
      createdFrom: "2026-07-01",
      createdTo: "2026-07-31",
      title: "auth",
    });
  });

  it("decodes colon shorthand for backward compatibility", () => {
    expect(gigsqlToFilters("created:2026-07-01..2026-07-31 title:auth")).toEqual({
      ...EMPTY,
      createdFrom: "2026-07-01",
      createdTo: "2026-07-31",
      title: "auth",
    });
  });

  it("parses `status in (todo, in_progress)` to both statuses (GIN-311)", () => {
    // The multi-status saved-view crux: IN syntax → an OR-of-statuses facet.
    expect(gigsqlToFilters("status in (todo, in_progress)")).toEqual({
      ...EMPTY,
      status: [EStoryStatus.Todo, EStoryStatus.InProgress],
    });
    // The colon-shorthand equivalent parses identically (repeated field = OR).
    expect(gigsqlToFilters("status:todo status:in_progress")).toEqual({
      ...EMPTY,
      status: [EStoryStatus.Todo, EStoryStatus.InProgress],
    });
  });

  it("parses cycle/module terms into their facets (GIN-313)", () => {
    expect(gigsqlToFilters("cycle = c1 AND module = m2 AND status = done")).toEqual({
      ...EMPTY,
      status: [EStoryStatus.Done],
      cycle: ["c1"],
      module: ["m2"],
    });
  });

  it("round-trips a full GigsQL query", () => {
    const original: IIssueFilters = {
      ...EMPTY,
      status: [EStoryStatus.InReview],
      priority: [EStoryPriority.Medium, EStoryPriority.High],
      assignee: ["me"],
      label: ["lbl-2"],
      cycle: ["cyc-1"],
      module: ["mod-1"],
      title: "checkout",
      dueFrom: "2026-08-01",
      dueTo: "2026-08-31",
      createdFrom: "2026-07-01",
      createdTo: null,
    };
    expect(gigsqlToFilters(filtersToGigsql(original))).toEqual(original);
  });
});

describe("visual rows codec", () => {
  it("serializes and parses AND-only visual rows", () => {
    const rows = filtersToRows({
      ...EMPTY,
      status: [EStoryStatus.Todo, EStoryStatus.InProgress],
      priority: [EStoryPriority.High],
    });
    const query = rowsToGigsql(rows);
    expect(query).toBe("status in (todo, in_progress) AND priority = high");
    expect(gigsqlToRows(query)).toEqual(rows);
  });
});
