import { describe, it, expect } from "vitest";

import { storyTypeOf } from "./story-type";
import { EStoryType, EStoryStatus, EStoryPriority, type IStory } from "@/types";

function makeStory(overrides: Partial<IStory>): IStory {
  return {
    id: "st_1", workspace_slug: "acme", project_id: "p1", cycle_id: null,
    module_id: null, parent_id: null, title: "t", description: "",
    status: EStoryStatus.Todo, priority: EStoryPriority.None,
    start_date: null, target_date: null, order: 0, assignee_id: null,
    ai_agent_id: null, label_id: null, label_ids: [], estimate_id: null, estimate_points: null,
    sub_issue_count: 0, bmad: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("storyTypeOf", () => {
  it("returns the story's type when present", () => {
    expect(storyTypeOf(makeStory({ type: EStoryType.Epic }))).toBe(EStoryType.Epic);
  });
  it("defaults to Story when type is undefined", () => {
    expect(storyTypeOf(makeStory({}))).toBe(EStoryType.Story);
  });
});
