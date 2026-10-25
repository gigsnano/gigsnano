import { describe, it, expect } from "vitest";

import {
  AT_RISK_WINDOW_DAYS,
  HEALTH_LABEL,
  isMilestone,
  scheduleHealth,
  storiesToGanttData,
  type IGanttTask,
} from "./dhtmlx-adapter";
import { EStoryStatus, EStoryPriority, EStoryRelationType, EStoryType, type IStory } from "@/types";

const TODAY = "2026-07-23";

function story(overrides: Partial<IStory>): IStory {
  return {
    id: "s1",
    workspace_slug: "acme",
    project_id: "p1",
    cycle_id: null,
    module_id: null,
    parent_id: null,
    title: "Do the thing",
    description: "",
    status: EStoryStatus.Todo,
    priority: EStoryPriority.None,
    start_date: null,
    target_date: null,
    order: 1,
    assignee_id: null,
    label_id: null, label_ids: [],
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  } as IStory;
}

function task(overrides: Partial<IGanttTask> = {}): IGanttTask {
  return {
    id: "t1",
    text: "WEB-1 Do the thing",
    start_date: "2026-07-20",
    duration: 5,
    progress: 0,
    parent: 0,
    gn_code: "WEB-1",
    gn_title: "Do the thing",
    gn_status: EStoryStatus.InProgress,
    gn_assignee_id: "u1",
    gn_assignee: "Ada",
    gn_due: "2026-07-30",
    gn_unscheduled_end: false,
    gn_blocked: false,
    ...overrides,
  };
}

describe("scheduleHealth", () => {
  it("reports on_track when nothing is wrong", () => {
    expect(scheduleHealth(task(), TODAY)).toBe("on_track");
  });

  it("puts overdue ahead of every other complaint", () => {
    // An overdue item that is also blocked and unassigned is *overdue* — the
    // reader needs the headline, not the longest list.
    const late = task({
      gn_due: "2026-07-01",
      gn_blocked: true,
      gn_assignee_id: null,
    });
    expect(scheduleHealth(late, TODAY)).toBe("overdue");
  });

  it("reports blocked before at_risk and unassigned", () => {
    const blocked = task({ gn_blocked: true, gn_assignee_id: null, gn_due: "2026-07-24" });
    expect(scheduleHealth(blocked, TODAY)).toBe("blocked");
  });

  it("flags at_risk only when due soon AND barely started", () => {
    const dueSoon = { gn_due: "2026-07-25" }; // 2 days out, inside the window
    expect(scheduleHealth(task({ ...dueSoon, progress: 0.1 }), TODAY)).toBe("at_risk");
    // Well underway: due soon is not a problem when the work is nearly done.
    expect(scheduleHealth(task({ ...dueSoon, progress: 0.9 }), TODAY)).toBe("on_track");
  });

  it("does not flag work due beyond the window", () => {
    const later = task({ gn_due: "2026-08-30", progress: 0 });
    expect(scheduleHealth(later, TODAY)).toBe("on_track");
  });

  it("uses the documented window boundary", () => {
    const onBoundary = task({
      gn_due: `2026-07-${String(23 + AT_RISK_WINDOW_DAYS).padStart(2, "0")}`,
      progress: 0,
    });
    expect(scheduleHealth(onBoundary, TODAY)).toBe("at_risk");
  });

  it("reports unassigned only when the dates are fine", () => {
    expect(scheduleHealth(task({ gn_assignee_id: null }), TODAY)).toBe("unassigned");
  });

  it("never complains about finished work", () => {
    const done = task({
      gn_status: EStoryStatus.Done,
      gn_due: "2026-01-01",
      gn_assignee_id: null,
      gn_blocked: true,
    });
    expect(scheduleHealth(done, TODAY)).toBe("on_track");
  });

  it("cannot be overdue without a due date — nothing was promised", () => {
    const openEnded = task({ gn_due: null, gn_unscheduled_end: true, gn_assignee_id: "u1" });
    expect(scheduleHealth(openEnded, TODAY)).toBe("on_track");
  });

  it("has wording for every state, so the cue is never colour alone", () => {
    for (const state of ["overdue", "blocked", "at_risk", "unassigned", "on_track"] as const) {
      expect(HEALTH_LABEL[state]).toBeTruthy();
    }
  });
});

describe("isMilestone", () => {
  it("treats a single-instant epic as a milestone", () => {
    expect(
      isMilestone(story({ type: EStoryType.Epic, target_date: "2026-08-01" })),
    ).toBe(true);
  });

  it("treats a same-day start and due as an instant", () => {
    expect(
      isMilestone(
        story({ type: EStoryType.Feature, start_date: "2026-08-01", target_date: "2026-08-01" }),
      ),
    ).toBe(true);
  });

  it("leaves a real span as a bar even for an epic", () => {
    expect(
      isMilestone(
        story({ type: EStoryType.Epic, start_date: "2026-08-01", target_date: "2026-08-20" }),
      ),
    ).toBe(false);
  });

  it("does not turn an ordinary one-day task into a milestone", () => {
    // A day of work is not a deadline; making every short task a diamond is how
    // a timeline stops meaning anything.
    expect(
      isMilestone(story({ type: EStoryType.Task, target_date: "2026-08-01" })),
    ).toBe(false);
  });
});

describe("blocked resolution in storiesToGanttData", () => {
  const blocker = story({ id: "a", title: "Ship the API", target_date: "2026-07-25" });
  const blocked = story({ id: "b", title: "Build the report", target_date: "2026-07-28" });
  const relation = {
    story_id: "a",
    related_story_id: "b",
    relation_type: EStoryRelationType.Blocks,
  };

  it("marks the blocked task, not the blocker", () => {
    const { data } = storiesToGanttData(
      [blocker, blocked],
      (s) => `WEB-${s.id}`,
      () => "",
      [relation] as never,
    );
    const byId = Object.fromEntries(data.map((t) => [t.id, t]));
    expect(byId.b.gn_blocked).toBe(true);
    expect(byId.a.gn_blocked).toBe(false);
  });

  it("reads blocked_by as the same edge mirrored", () => {
    const { data } = storiesToGanttData(
      [blocker, blocked],
      (s) => `WEB-${s.id}`,
      () => "",
      [
        {
          story_id: "b",
          related_story_id: "a",
          relation_type: EStoryRelationType.BlockedBy,
        },
      ] as never,
    );
    expect(data.find((t) => t.id === "b")!.gn_blocked).toBe(true);
  });

  it("stops treating an item as blocked once the blocker is done", () => {
    // Otherwise a finished project stays painted red.
    const { data } = storiesToGanttData(
      [{ ...blocker, status: EStoryStatus.Done }, blocked],
      (s) => `WEB-${s.id}`,
      () => "",
      [relation] as never,
    );
    expect(data.find((t) => t.id === "b")!.gn_blocked).toBe(false);
  });

  it("ignores relations that carry no ordering", () => {
    const { data } = storiesToGanttData(
      [blocker, blocked],
      (s) => `WEB-${s.id}`,
      () => "",
      [{ ...relation, relation_type: EStoryRelationType.RelatesTo }] as never,
    );
    expect(data.every((t) => !t.gn_blocked)).toBe(true);
  });
});
