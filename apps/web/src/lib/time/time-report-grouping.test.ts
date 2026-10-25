import { describe, expect, it } from "vitest";

import type { ITimeReportEntry } from "@/types";

import { groupByPerson, groupByWorkItem, totalHours } from "./time-report-grouping";

const entry = (over: Partial<ITimeReportEntry>): ITimeReportEntry => ({
  id: "e",
  hours: 1,
  note: "",
  created_at: "2026-07-13T00:00:00Z",
  user_id: "u1",
  user_name: "Ada",
  user_avatar_url: null,
  story_id: "s1",
  story_title: "Story 1",
  story_code: "MBA-1",
  project_id: "p1",
  project_name: "Mobile App",
  ...over,
});

const entries = [
  entry({ id: "a", user_id: "u1", user_name: "Ada", story_id: "s1", hours: 2 }),
  entry({ id: "b", user_id: "u1", user_name: "Ada", story_id: "s2", story_code: "MBA-2", hours: 1 }),
  entry({ id: "c", user_id: "u2", user_name: "Bob", story_id: "s1", hours: 3 }),
];

describe("groupByPerson", () => {
  it("sums per person, sorted by hours desc", () => {
    const g = groupByPerson(entries);
    expect(g.map((r) => [r.user_name, r.total_hours, r.entry_count])).toEqual([
      ["Ada", 3, 2],
      ["Bob", 3, 1],
    ]);
  });
});

describe("groupByWorkItem", () => {
  it("sums per work item with contributor count", () => {
    const g = groupByWorkItem(entries);
    const s1 = g.find((r) => r.story_id === "s1");
    expect(s1?.total_hours).toBe(5); // 2 (Ada) + 3 (Bob)
    expect(s1?.contributor_count).toBe(2);
    const s2 = g.find((r) => r.story_id === "s2");
    expect(s2?.total_hours).toBe(1);
    expect(s2?.contributor_count).toBe(1);
  });
});

describe("totalHours", () => {
  it("sums all entries", () => {
    expect(totalHours(entries)).toBe(6);
  });
});
