import { describe, expect, it } from "vitest";

import { EStoryStatus, type IStory } from "@/types";

import { workItemPrimaryAction } from "./work-item-primary-action";

const story = (patch: Partial<IStory>) =>
  ({
    status: EStoryStatus.Todo,
    assignee_id: null,
    ai_agent_id: null,
    ...patch,
  }) as IStory;

describe("workItemPrimaryAction", () => {
  it("asks for an executor when there is none", () => {
    expect(workItemPrimaryAction(story({}))).toEqual({ kind: "assign", label: "Assign work" });
  });

  it("sends a delegated item to its runs", () => {
    expect(workItemPrimaryAction(story({ ai_agent_id: "agent-1" }))).toEqual({
      kind: "tab",
      label: "View runs",
      tab: "runs",
    });
  });

  it("has no dominant action once a human owns it", () => {
    expect(workItemPrimaryAction(story({ assignee_id: "user-1" }))).toBeNull();
  });

  it("has no dominant action when the work is done, whoever holds it", () => {
    expect(workItemPrimaryAction(story({ status: EStoryStatus.Done }))).toBeNull();
    expect(
      workItemPrimaryAction(story({ status: EStoryStatus.Done, ai_agent_id: "agent-1" })),
    ).toBeNull();
  });
});
