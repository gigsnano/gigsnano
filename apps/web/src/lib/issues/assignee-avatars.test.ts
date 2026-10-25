import { describe, it, expect } from "vitest";
import { parseBmadAgent, agentAvatarFromStory, humanAvatar } from "./assignee-avatars";
import { EStoryStatus, EStoryPriority, type IStory } from "@/types";

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

const bmad = (agent: string): IStory["bmad"] => ({
  workflow: "w",
  agent,
  artifact: "a.md",
  is_locked: false,
  is_required: true,
});

describe("parseBmadAgent", () => {
  it("splits 'Role · Persona' on the middot", () => {
    expect(parseBmadAgent("Analyst · Mary")).toEqual({ role: "Analyst", persona: "Mary" });
  });
  it("keeps a multi-word role and its persona", () => {
    expect(parseBmadAgent("Product Manager · John")).toEqual({
      role: "Product Manager",
      persona: "John",
    });
  });
  it("returns an empty persona for a bare role", () => {
    expect(parseBmadAgent("Analyst")).toEqual({ role: "Analyst", persona: "" });
  });
});

describe("agentAvatarFromStory", () => {
  it("derives the agent from a BMAD card (handles the brownfield Paige persona)", () => {
    const a = agentAvatarFromStory(makeStory({ bmad: bmad("Analyst · Paige") }));
    expect(a).toMatchObject({
      kind: "agent",
      role: "Analyst",
      persona: "Paige",
      display_name: "Analyst · Paige",
    });
  });
  it("looks up a manual story's ai_agent_id in the roster", () => {
    const a = agentAvatarFromStory(makeStory({ ai_agent_id: "agent_pm" }));
    expect(a).toMatchObject({ kind: "agent", role: "Product Manager", persona: "John" });
  });
  it("returns null when ai_agent_id is unknown", () => {
    expect(agentAvatarFromStory(makeStory({ ai_agent_id: "agent_nope" }))).toBeNull();
  });
  it("returns null for a manual story with no agent", () => {
    expect(agentAvatarFromStory(makeStory({}))).toBeNull();
  });
});

describe("humanAvatar", () => {
  it("maps an IMemberPreview into a human descriptor", () => {
    expect(humanAvatar({ id: "u1", display_name: "Jane Doe", avatar_url: null })).toEqual({
      kind: "human",
      id: "u1",
      display_name: "Jane Doe",
      avatar_url: null,
    });
  });
});
