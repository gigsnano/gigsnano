import { describe, expect, it } from "vitest";

import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

import { placeByDay, placementDay } from "./calendar-placement";

function story(overrides: Partial<IStory> & Pick<IStory, "id">): IStory {
  return {
    workspace_slug: "acme",
    project_id: "proj-1",
    cycle_id: null,
    module_id: null,
    parent_id: null,
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

const dueOnly = story({ id: "due-only", target_date: "2026-08-17" });
const startOnly = story({ id: "start-only", start_date: "2026-08-03" });
const both = story({ id: "both", start_date: "2026-08-03", target_date: "2026-08-17" });
const undated = story({ id: "undated" });

describe("placementDay", () => {
  it("uses the due date under the due basis", () => {
    expect(placementDay(both, "due")).toBe("2026-08-17");
  });

  it("uses the start date under the start basis", () => {
    expect(placementDay(both, "start")).toBe("2026-08-03");
  });

  it("returns null when the chosen date is absent", () => {
    expect(placementDay(startOnly, "due")).toBeNull();
    expect(placementDay(dueOnly, "start")).toBeNull();
    expect(placementDay(undated, "due")).toBeNull();
    expect(placementDay(undated, "start")).toBeNull();
  });

  it("keys a timestamp to its day, not its instant", () => {
    const late = story({ id: "late", target_date: "2026-08-01T23:30:00Z" });
    expect(placementDay(late, "due")).toBe("2026-08-01");
  });
});

describe("placeByDay", () => {
  const all = [dueOnly, startOnly, both, undated];

  it("is the gap this closes: a start-only item is absent under due, present under start", () => {
    // Asserted in BOTH directions — one alone would pass even if the basis
    // were ignored entirely.
    const byDue = placeByDay(all, "due");
    const byStart = placeByDay(all, "start");

    expect([...byDue.values()].flat().map((s) => s.id)).not.toContain("start-only");
    expect(byStart.get("2026-08-03")?.map((s) => s.id)).toContain("start-only");
  });

  it("places a both-dated item on a different day per basis", () => {
    expect(placeByDay(all, "due").get("2026-08-17")?.map((s) => s.id)).toContain("both");
    expect(placeByDay(all, "start").get("2026-08-03")?.map((s) => s.id)).toContain("both");
  });

  it("omits an item with neither date under either basis", () => {
    for (const basis of ["due", "start"] as const) {
      expect([...placeByDay(all, basis).values()].flat().map((s) => s.id)).not.toContain(
        "undated",
      );
    }
  });

  it("places each item at most once", () => {
    for (const basis of ["due", "start"] as const) {
      const ids = [...placeByDay(all, basis).values()].flat().map((s) => s.id);
      expect(ids.length).toBe(new Set(ids).size);
    }
  });

  it("groups several items falling on one day", () => {
    const a = story({ id: "a", target_date: "2026-08-17" });
    const b = story({ id: "b", target_date: "2026-08-17" });
    expect(placeByDay([a, b], "due").get("2026-08-17")?.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
