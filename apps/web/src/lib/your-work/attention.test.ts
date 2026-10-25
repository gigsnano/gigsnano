import { describe, expect, it } from "vitest";

import { EStoryStatus, EStoryPriority, type IStory } from "@/types";

import { buildFocus, dueDescriptor, EFocusSection } from "./attention";

const NOW = new Date("2026-07-24T12:00:00Z");

function story(over: Partial<IStory> & { id: string }): IStory {
  return {
    workspace_slug: "ws",
    project_id: "p1",
    cycle_id: null,
    module_id: null,
    parent_id: null,
    title: over.id,
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
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

describe("buildFocus", () => {
  const stories = [
    story({ id: "overdue", target_date: "2026-07-22" }),
    story({ id: "today", target_date: "2026-07-24" }),
    story({ id: "urgent", priority: EStoryPriority.Urgent }),
    story({ id: "high-soon", priority: EStoryPriority.High, target_date: "2026-07-27" }),
    story({ id: "medium-soon", priority: EStoryPriority.Medium, target_date: "2026-07-27" }),
    story({ id: "delegated", ai_agent_id: "agent-1" }),
    story({ id: "later" }),
    story({ id: "done", status: EStoryStatus.Done, target_date: "2026-07-01" }),
  ];

  const { sections, summary } = buildFocus(stories, NOW);
  const byId = new Map(sections.flatMap((s) => s.items.map((i) => [i.story.id, i])));

  it("routes each open item to exactly one section", () => {
    const total = sections.reduce((n, s) => n + s.items.length, 0);
    expect(total).toBe(7); // done excluded
    expect(new Set(byId.keys()).size).toBe(7);
  });

  it("places urgency drivers in Needs attention with a reason", () => {
    for (const id of ["overdue", "today", "urgent", "high-soon"]) {
      expect(byId.get(id)?.section).toBe(EFocusSection.NeedsAttention);
      expect(byId.get(id)?.reason).toBeTruthy();
    }
    expect(byId.get("overdue")?.reason).toBe("Overdue by 2 days");
    expect(byId.get("today")?.reason).toBe("Due today");
  });

  it("routes non-urgent items to their own sections", () => {
    expect(byId.get("medium-soon")?.section).toBe(EFocusSection.Upcoming);
    expect(byId.get("delegated")?.section).toBe(EFocusSection.Delegated);
    expect(byId.get("later")?.section).toBe(EFocusSection.Later);
  });

  it("orders overdue ahead of due-today inside Needs attention", () => {
    const attention = sections.find((s) => s.section === EFocusSection.NeedsAttention)!;
    expect(attention.items[0].story.id).toBe("overdue");
  });

  it("returns sections in fixed order, empty ones omitted", () => {
    expect(sections.map((s) => s.section)).toEqual([
      EFocusSection.NeedsAttention,
      EFocusSection.Upcoming,
      EFocusSection.Delegated,
      EFocusSection.Later,
    ]);
  });

  it("summarizes attention counts", () => {
    expect(summary).toEqual({ needAttention: 4, overdue: 1, dueToday: 1 });
  });
});

describe("dueDescriptor", () => {
  it("labels each tone without relying on color", () => {
    expect(dueDescriptor("2026-07-22", NOW)).toEqual({ label: "Overdue 2 days", tone: "overdue" });
    expect(dueDescriptor("2026-07-24", NOW)).toEqual({ label: "Due today", tone: "today" });
    expect(dueDescriptor("2026-07-25", NOW)).toEqual({ label: "Due tomorrow", tone: "soon" });
    expect(dueDescriptor("2026-08-30", NOW).tone).toBe("later");
    expect(dueDescriptor(null, NOW)).toEqual({ label: "No date", tone: "none" });
  });
});
