import { describe, it, expect } from "vitest";

import { EStoryStatus, EStoryPriority, type IStory } from "@/types";
import { spreadsheetRows } from "./spreadsheet-rows";

function story(over: Partial<IStory>): IStory {
  return {
    id: "x",
    workspace_slug: "w",
    project_id: "p",
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
    label_id: null,
    label_ids: [],
    estimate_id: null,
    estimate_points: null,
    sub_issue_count: 0,
    bmad: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const ids = (rows: IStory[]) => rows.map((s) => s.id);

describe("spreadsheetRows", () => {
  it("orders by the active sort levels", () => {
    const rows = [
      story({ id: "none", priority: EStoryPriority.None }),
      story({ id: "urgent", priority: EStoryPriority.Urgent }),
    ];
    expect(ids(spreadsheetRows(rows, [{ key: "priority", dir: "asc" }], {}))).toEqual([
      "none",
      "urgent",
    ]);
  });

  it("falls back to the stored order when nothing is sorted", () => {
    const rows = [story({ id: "second", order: 2 }), story({ id: "first", order: 1 })];
    expect(ids(spreadsheetRows(rows, [], {}))).toEqual(["first", "second"]);
  });

  it("sorts assignees by name, not by id", () => {
    const rows = [
      story({ id: "zoe-row", assignee_id: "u2" }),
      story({ id: "amy-row", assignee_id: "u1" }),
    ];
    const ctx = {
      // Ids deliberately ordered opposite to the names they resolve to.
      assigneeName: (id: string) => (id === "u1" ? "Zoe" : "Amy"),
    };
    expect(ids(spreadsheetRows(rows, [{ key: "assignee", dir: "asc" }], ctx))).toEqual([
      "zoe-row",
      "amy-row",
    ]);
  });

  it("leaves sub-items in place — the population rule already decided them", () => {
    const rows = [
      story({ id: "parent", sub_issue_count: 1 }),
      story({ id: "child", parent_id: "parent" }),
    ];
    expect(ids(spreadsheetRows(rows, [], {}))).toEqual(["parent", "child"]);
  });
});
