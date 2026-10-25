import { describe, it, expect } from "vitest";

import { allNavigationRowIds, buildIssueTree, treeModeFor, visibleListRowIds } from "./issue-tree";
import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

function makeStory(overrides: Partial<IStory>): IStory {
  return {
    id: "st_1",
    workspace_slug: "acme",
    project_id: "p1",
    cycle_id: null,
    module_id: null,
    parent_id: null,
    title: "t",
    description: "",
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    start_date: null,
    target_date: null,
    order: 0,
    assignee_id: null,
    ai_agent_id: null,
    label_id: null, label_ids: [],
    estimate_id: null,
    estimate_points: null,
    sub_issue_count: 0,
    bmad: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildIssueTree", () => {
  const parent = makeStory({ id: "p", sub_issue_count: 2 });
  const childA = makeStory({ id: "ca", parent_id: "p" });
  const childB = makeStory({ id: "cb", parent_id: "p" });
  const loner = makeStory({ id: "l" });
  const orphan = makeStory({ id: "o", parent_id: "missing" });

  it("nests children under a present parent", () => {
    const tree = buildIssueTree([parent, childA, childB, loner], "nested");
    expect(tree.rows.map((s) => s.id)).toEqual(["p", "l"]);
    expect(tree.childrenById.get("p")?.map((s) => s.id)).toEqual(["ca", "cb"]);
  });

  it("omits a parent whose children were all filtered out", () => {
    // The chevron regression: `sub_issue_count` says 2, but nothing matched.
    // An absent map entry is what makes the chevron disappear.
    const tree = buildIssueTree([parent, loner], "nested");
    expect(tree.childrenById.has("p")).toBe(false);
  });

  it("promotes an orphan to a row and nests it nowhere", () => {
    const tree = buildIssueTree([orphan, loner], "nested");
    expect(tree.rows.map((s) => s.id)).toEqual(["o", "l"]);
    expect(tree.childrenById.size).toBe(0);
  });

  it("nests a grandchild under its own parent, not the root", () => {
    const child = makeStory({ id: "c", parent_id: "p", sub_issue_count: 1 });
    const grandchild = makeStory({ id: "g", parent_id: "c" });
    const tree = buildIssueTree([parent, child, grandchild], "nested");
    expect(tree.rows.map((s) => s.id)).toEqual(["p"]);
    expect(tree.childrenById.get("p")?.map((s) => s.id)).toEqual(["c"]);
    expect(tree.childrenById.get("c")?.map((s) => s.id)).toEqual(["g"]);
  });

  it("makes every item a row in flat mode and nests nothing", () => {
    const tree = buildIssueTree([parent, childA, childB, loner], "flat");
    expect(tree.rows.map((s) => s.id)).toEqual(["p", "ca", "cb", "l"]);
    expect(tree.childrenById.size).toBe(0);
  });

  it("accounts for every item exactly once in both modes", () => {
    const input = [parent, childA, childB, loner, orphan];
    for (const mode of ["nested", "flat"] as const) {
      const tree = buildIssueTree(input, mode);
      const nested = [...tree.childrenById.values()].reduce((n, c) => n + c.length, 0);
      expect(tree.rows.length + nested).toBe(tree.all.length);
      expect(tree.all.length).toBe(input.length);
    }
  });
});

describe("treeModeFor", () => {
  it("is always flat where an item's position is owned by another axis", () => {
    for (const layout of ["kanban", "calendar", "graph"] as const) {
      expect(treeModeFor(layout, false)).toBe("flat");
      expect(treeModeFor(layout, true)).toBe("flat");
    }
  });

  it("follows the toggle where rows can nest", () => {
    for (const layout of ["list", "spreadsheet", "gantt"] as const) {
      expect(treeModeFor(layout, false)).toBe("nested");
      expect(treeModeFor(layout, true)).toBe("flat");
    }
  });
});

describe("row walks over the tree", () => {
  const parent = makeStory({ id: "p", sub_issue_count: 2 });
  const childA = makeStory({ id: "ca", parent_id: "p" });
  const childB = makeStory({ id: "cb", parent_id: "p" });
  const loner = makeStory({ id: "l" });
  const tree = buildIssueTree([parent, childA, childB, loner], "nested");
  const groups = [{ key: "all", stories: tree.rows }];

  it("skips children of a collapsed parent", () => {
    expect(visibleListRowIds(groups, tree.childrenById, [], [])).toEqual(["p", "l"]);
  });

  it("includes children of an expanded parent, in order", () => {
    expect(visibleListRowIds(groups, tree.childrenById, ["p"], [])).toEqual([
      "p", "ca", "cb", "l",
    ]);
  });

  it("walks every child for prev/next regardless of expand state", () => {
    expect(allNavigationRowIds(groups, tree.childrenById, [])).toEqual([
      "p", "ca", "cb", "l",
    ]);
  });

  it("descends a grandchild only when every ancestor down to it is expanded", () => {
    const child = makeStory({ id: "c", parent_id: "p", sub_issue_count: 1 });
    const grandchild = makeStory({ id: "g", parent_id: "c" });
    const deepTree = buildIssueTree([parent, child, grandchild], "nested");
    const deepGroups = [{ key: "all", stories: deepTree.rows }];

    expect(visibleListRowIds(deepGroups, deepTree.childrenById, ["p", "c"], [])).toEqual([
      "p", "c", "g",
    ]);
    expect(visibleListRowIds(deepGroups, deepTree.childrenById, ["p"], [])).toEqual(["p", "c"]);
  });

  it("orders siblings by the active sort, not insertion order", () => {
    const sort = [{ key: "title" as const, dir: "desc" as const }];
    const sortedTree = buildIssueTree(
      [parent, { ...childA, title: "aaa" }, { ...childB, title: "zzz" }, loner],
      "nested",
    );
    const sortedGroups = [{ key: "all", stories: sortedTree.rows }];

    expect(visibleListRowIds(sortedGroups, sortedTree.childrenById, ["p"], sort)).toEqual([
      "p", "cb", "ca", "l",
    ]);
  });
});
