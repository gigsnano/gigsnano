import { describe, expect, it } from "vitest";

import { EStoryPriority, EStoryStatus, type IStory } from "@/types";

import { storyRisk } from "./story-risk";

const TODAY = new Date("2026-07-18T00:00:00");

const base = (over: Partial<IStory>): IStory =>
  ({
    id: "s",
    status: EStoryStatus.InProgress,
    priority: EStoryPriority.Medium,
    target_date: null,
    project_id: "p",
    ...over,
  }) as IStory;

describe("storyRisk", () => {
  it("flags overdue open items, weighted by days late", () => {
    const r = storyRisk(base({ target_date: "2026-07-10" }), TODAY);
    expect(r?.level).toBe("overdue");
    expect(r?.weight).toBeGreaterThan(1000);
  });

  it("flags urgent/high open items", () => {
    expect(storyRisk(base({ priority: EStoryPriority.Urgent }), TODAY)?.level).toBe("high");
    expect(storyRisk(base({ priority: EStoryPriority.High }), TODAY)?.level).toBe("high");
  });

  it("clears done items and on-track medium work", () => {
    expect(storyRisk(base({ status: EStoryStatus.Done, target_date: "2026-07-01" }), TODAY)).toBeNull();
    expect(storyRisk(base({ priority: EStoryPriority.Medium }), TODAY)).toBeNull();
  });
});
