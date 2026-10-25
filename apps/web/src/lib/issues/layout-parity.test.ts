import { describe, expect, it } from "vitest";

import { EMPTY_ISSUE_FILTERS } from "@/store/ui/issues-view.store";
import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

import { filterStories, groupStories } from "./issues-grouping";
import { buildIssueTree, treeModeFor } from "./issue-tree";

const story = (over: Partial<IStory>): IStory =>
  ({
    id: "s",
    title: "t",
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    order: 0,
    parent_id: null,
    sub_issue_count: 0,
    assignee_id: null,
    label_ids: [],
    target_date: null,
    start_date: null,
    estimate_points: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as IStory;

const stories = [
  story({ id: "parent", sub_issue_count: 2 }),
  story({ id: "child-1", parent_id: "parent", status: EStoryStatus.InProgress }),
  story({ id: "child-2", parent_id: "parent" }),
  story({ id: "loner" }),
];

/**
 * The bug that started this: the List called `rootStories` and counted only
 * top-level items while the Kanban rendered every card it was given — same
 * filter, two totals.
 *
 * The invariant that replaced it is about MATCHES, not rows: every layout
 * reports the same `all.length` for a given filter, while `rows` differs by how
 * that layout arranges them. Switching List → Kanban must not change how much
 * work matched.
 */

describe("layout parity", () => {
  const LAYOUTS = ["list", "spreadsheet", "gantt", "kanban", "calendar", "graph"] as const;

  for (const showSubIssues of [true, false]) {
    it(`every layout reports the same match count (showSubIssues=${showSubIssues})`, () => {
      const filtered = filterStories(stories, EMPTY_ISSUE_FILTERS);
      const totals = LAYOUTS.map(
        (layout) => buildIssueTree(filtered, treeModeFor(layout, showSubIssues)).all.length,
      );
      expect(new Set(totals).size).toBe(1);
      expect(totals[0]).toBe(4);
    });
  }

  it("nests sub-items on the layouts that can, and not on the ones that cannot", () => {
    const filtered = filterStories(stories, EMPTY_ISSUE_FILTERS);
    const rowsFor = (layout: (typeof LAYOUTS)[number]) =>
      buildIssueTree(filtered, treeModeFor(layout, false)).rows.length;

    expect(rowsFor("list")).toBe(2); // parent + loner; children are nested
    expect(rowsFor("spreadsheet")).toBe(2);
    expect(rowsFor("gantt")).toBe(2);
    // Kanban/Calendar/Graph never hide an item behind a chevron they cannot draw.
    expect(rowsFor("kanban")).toBe(4);
    expect(rowsFor("calendar")).toBe(4);
    expect(rowsFor("graph")).toBe(4);
  });

  it("keeps a sub-item that matches a filter its parent does not", () => {
    // The nastiest case: filtering to In progress leaves an orphaned child.
    const filters = { ...EMPTY_ISSUE_FILTERS, status: [EStoryStatus.InProgress] };
    const filtered = filterStories(stories, filters);
    for (const layout of LAYOUTS) {
      const tree = buildIssueTree(filtered, treeModeFor(layout, false));
      expect(tree.all.length).toBe(1);
      // ...and it is a ROW, not hidden under a parent that isn't there.
      expect(tree.rows.map((s) => s.id)).toEqual(["child-1"]);
    }
  });

  it("groups the list over rows, so group totals sum to rows not to matches", () => {
    const tree = buildIssueTree(filterStories(stories, EMPTY_ISSUE_FILTERS), "nested");
    const grouped = groupStories(tree.rows, "status", []).reduce(
      (n, g) => n + g.stories.length,
      0,
    );
    expect(grouped).toBe(tree.rows.length);
    expect(grouped).toBeLessThan(tree.all.length);
  });
});
