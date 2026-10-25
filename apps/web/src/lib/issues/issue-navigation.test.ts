import { describe, expect, it } from "vitest";

import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

import { issueNavPosition, navigationIssueIds } from "./issue-navigation";
import { buildIssueTree } from "./issue-tree";

const stories = [
  { id: "a", status: EStoryStatus.Todo, order: 1, parent_id: null, target_date: null },
  { id: "b", status: EStoryStatus.InProgress, order: 2, parent_id: null, target_date: null },
  { id: "c", status: EStoryStatus.Done, order: 3, parent_id: null, target_date: null },
] as const;

/** Full `IStory` fixture — this file's other fixtures are intentionally partial
 *  (pre-existing tsc error, out of scope here), but a nested-tree case needs
 *  `parent_id` to actually resolve, so it gets a complete, real story. */
function makeStory(overrides: Partial<IStory> & Pick<IStory, "id" | "parent_id">): IStory {
  return {
    workspace_slug: "acme",
    project_id: "proj-1",
    cycle_id: null,
    module_id: null,
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

describe("navigationIssueIds", () => {
  it("orders kanban columns by status, then by the active sort", () => {
    const ids = navigationIssueIds(buildIssueTree([...stories] as unknown as IStory[], "flat"), {
      layout: "kanban",
      groupBy: "none",
      sort: [],
      expandedIssueIds: [],
      showSubIssues: false,
    });
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("follows the sort within a status column", () => {
    const column = [
      { id: "later", status: EStoryStatus.Todo, order: 1, parent_id: null, target_date: "2026-03-02" },
      { id: "sooner", status: EStoryStatus.Todo, order: 2, parent_id: null, target_date: "2026-03-01" },
    ];
    const ids = navigationIssueIds(buildIssueTree([...column] as never, "flat"), {
      layout: "kanban",
      groupBy: "none",
      sort: [{ key: "due", dir: "asc" }],
      expandedIssueIds: [],
      showSubIssues: false,
    });
    expect(ids).toEqual(["sooner", "later"]);
  });

  it("descends into nested children for the spreadsheet layout", () => {
    // Regression: the spreadsheet nests (like the list) but had no branch that
    // walked `childrenById`, so a nested child's id landed in neither `ids` nor
    // `fallbackIds` and its peek panel showed no prev/next arrows at all.
    const parent = makeStory({ id: "parent", parent_id: null, order: 1 });
    const child = makeStory({ id: "child", parent_id: "parent", order: 1 });
    const other = makeStory({ id: "other", parent_id: null, order: 2 });
    const tree = buildIssueTree([parent, child, other], "nested");

    const ids = navigationIssueIds(tree, {
      layout: "spreadsheet",
      groupBy: "none",
      sort: [],
      expandedIssueIds: [],
      showSubIssues: false,
    });

    expect(ids).toContain("child");
    expect(ids).toEqual(["parent", "child", "other"]);
  });
});

describe("issueNavPosition", () => {
  it("returns prev/next neighbors", () => {
    expect(issueNavPosition("b", ["a", "b", "c"])).toMatchObject({
      index: 1,
      position: 2,
      total: 3,
      prevId: "a",
      nextId: "c",
    });
  });

  it("returns empty neighbors when id is missing", () => {
    expect(issueNavPosition("missing", ["a", "b"])).toMatchObject({
      index: -1,
      prevId: null,
      nextId: null,
    });
  });
});

describe("navigationIssueIds sort context", () => {
  // The ids sort z→x, but the people sort Ada→Zoe. Without a context the sort
  // falls back to the raw assignee id, so prev/next walked one order while the
  // screen showed another — only under an assignee sort, which is why it went
  // unnoticed.
  const byName = { assigneeName: (id: string) => ({ u_z: "Ada", u_x: "Zoe" })[id] ?? null };
  const withAssignees = [
    makeStory({ id: "zoe", parent_id: null, assignee_id: "u_x" }),
    makeStory({ id: "ada", parent_id: null, assignee_id: "u_z" }),
  ];
  const opts = {
    groupBy: "none" as const,
    sort: [{ key: "assignee" as const, dir: "asc" as const }],
    expandedIssueIds: [],
    showSubIssues: true,
  };

  it("orders by display name when a context is supplied", () => {
    const ids = navigationIssueIds(buildIssueTree(withAssignees, "flat"), {
      ...opts,
      layout: "spreadsheet",
      ctx: byName,
    });
    expect(ids).toEqual(["ada", "zoe"]);
  });

  it("falls back to the raw id when no context is supplied", () => {
    // Documents the fallback rather than endorsing it: every real call site
    // passes `data.sortCtx`, and this is what they would get if one stopped.
    const ids = navigationIssueIds(buildIssueTree(withAssignees, "flat"), {
      ...opts,
      layout: "spreadsheet",
    });
    expect(ids).toEqual(["zoe", "ada"]);
  });

  it("carries the context into nested children too", () => {
    const parent = makeStory({ id: "p", parent_id: null, sub_issue_count: 2 });
    const tree = buildIssueTree(
      [
        parent,
        makeStory({ id: "zoe", parent_id: "p", assignee_id: "u_x" }),
        makeStory({ id: "ada", parent_id: "p", assignee_id: "u_z" }),
      ],
      "nested",
    );
    const ids = navigationIssueIds(tree, {
      ...opts,
      layout: "spreadsheet",
      showSubIssues: false,
      ctx: byName,
    });
    expect(ids).toEqual(["p", "ada", "zoe"]);
  });
});
