import { describe, expect, it } from "vitest";

import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

import { sortStories, type ISortLevel } from "./story-sort";

const story = (over: Partial<IStory>): IStory =>
  ({
    id: "s",
    title: "",
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    order: 0,
    parent_id: null,
    sub_issue_count: 0,
    assignee_id: null,
    target_date: null,
    start_date: null,
    estimate_points: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as IStory;

describe("sortStories", () => {
  it("keeps the user's stored arrangement when nothing is sorted", () => {
    const a = story({ id: "a", order: 2 });
    const b = story({ id: "b", order: 1 });
    expect(sortStories([a, b], []).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("sorts by one key in the requested direction", () => {
    const low = story({ id: "low", priority: EStoryPriority.Low });
    const urgent = story({ id: "urgent", priority: EStoryPriority.Urgent });
    const desc: ISortLevel[] = [{ key: "priority", dir: "desc" }];
    const asc: ISortLevel[] = [{ key: "priority", dir: "asc" }];

    expect(sortStories([low, urgent], desc).map((s) => s.id)).toEqual(["urgent", "low"]);
    expect(sortStories([low, urgent], asc).map((s) => s.id)).toEqual(["low", "urgent"]);
  });

  it("breaks a tie with the next level down", () => {
    const a = story({ id: "a", priority: EStoryPriority.High, title: "b" });
    const b = story({ id: "b", priority: EStoryPriority.High, title: "a" });
    const sort: ISortLevel[] = [
      { key: "priority", dir: "desc" },
      { key: "title", dir: "asc" },
    ];

    expect(sortStories([a, b], sort).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("reaches the third level when the first two tie", () => {
    const a = story({ id: "a", priority: EStoryPriority.High, title: "same", created_at: "2026-02-01T00:00:00Z" });
    const b = story({ id: "b", priority: EStoryPriority.High, title: "same", created_at: "2026-01-01T00:00:00Z" });
    const sort: ISortLevel[] = [
      { key: "priority", dir: "desc" },
      { key: "title", dir: "asc" },
      { key: "created", dir: "asc" },
    ];

    expect(sortStories([a, b], sort).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("puts missing values last in BOTH directions", () => {
    // A story with no due date is not due first. Flipping the arrow must not
    // promote "unset" to the top of the list.
    const dated = story({ id: "dated", target_date: "2026-03-01" });
    const undated = story({ id: "undated", target_date: null });

    for (const dir of ["asc", "desc"] as const) {
      expect(sortStories([undated, dated], [{ key: "due", dir }]).map((s) => s.id)).toEqual([
        "dated",
        "undated",
      ]);
    }
  });

  it("is stable for rows no level can separate", () => {
    const a = story({ id: "a", priority: EStoryPriority.Medium });
    const b = story({ id: "b", priority: EStoryPriority.Medium });

    expect(sortStories([a, b], [{ key: "priority", dir: "asc" }]).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("sorts titles case-insensitively", () => {
    const upper = story({ id: "upper", title: "Alpha" });
    const lower = story({ id: "lower", title: "beta" });

    expect(sortStories([lower, upper], [{ key: "title", dir: "asc" }]).map((s) => s.id)).toEqual([
      "upper",
      "lower",
    ]);
  });

  it("leaves the input array alone", () => {
    const input = [story({ id: "a", order: 2 }), story({ id: "b", order: 1 })];
    sortStories(input, [{ key: "title", dir: "asc" }]);
    expect(input.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
