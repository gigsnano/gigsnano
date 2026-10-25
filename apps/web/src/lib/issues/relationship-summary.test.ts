import { describe, expect, it } from "vitest";

import { EStoryRelationType, EStoryStatus, type IStory } from "@/types";
import type { IStoryRelation } from "@/types/story/story-detail";

import { relationshipSummary } from "./relationship-summary";

const story = (patch: Partial<IStory> = {}) =>
  ({ id: "parent", parent_id: null, sub_issue_count: 0, status: EStoryStatus.Todo, ...patch }) as IStory;

const child = (id: string, status: EStoryStatus) =>
  ({ id, parent_id: "parent", status, sub_issue_count: 0 }) as IStory;

const rel = (relation_type: EStoryRelationType) => ({ id: relation_type, relation_type }) as IStoryRelation;

describe("relationshipSummary", () => {
  it("is empty when the item relates to nothing", () => {
    const s = relationshipSummary({
      story: story(),
      projectStories: [],
      relations: [],
      linkCount: 0,
    });
    expect(s.isEmpty).toBe(true);
    expect(s.hasBlockers).toBe(false);
  });

  it("counts done sub-items out of the API's total", () => {
    const s = relationshipSummary({
      story: story({ sub_issue_count: 3 }),
      projectStories: [
        child("a", EStoryStatus.Done),
        child("b", EStoryStatus.InProgress),
        // A child the client hasn't loaded still counts toward the total.
      ],
      relations: [],
      linkCount: 0,
    });
    expect(s.subItems).toEqual({ done: 1, total: 3 });
    expect(s.isEmpty).toBe(false);
  });

  it("falls back to loaded children when sub_issue_count is absent", () => {
    const s = relationshipSummary({
      story: story({ sub_issue_count: 0 }),
      projectStories: [child("a", EStoryStatus.Done), child("b", EStoryStatus.Done)],
      relations: [],
      linkCount: 0,
    });
    expect(s.subItems).toEqual({ done: 2, total: 2 });
  });

  it("ignores other items' children", () => {
    const s = relationshipSummary({
      story: story(),
      projectStories: [{ id: "x", parent_id: "someone-else" } as IStory],
      relations: [],
      linkCount: 0,
    });
    expect(s.subItems.total).toBe(0);
  });

  it("splits relations by type and flags only blocked-by as a blocker", () => {
    const s = relationshipSummary({
      story: story(),
      projectStories: [],
      relations: [
        rel(EStoryRelationType.Blocks),
        rel(EStoryRelationType.RelatesTo),
        rel(EStoryRelationType.Duplicate),
      ],
      linkCount: 2,
    });
    expect(s).toMatchObject({ blocking: 1, blockedBy: 0, related: 1, duplicates: 1, links: 2 });
    // Blocking others is not a problem with THIS item; being blocked is.
    expect(s.hasBlockers).toBe(false);

    const blocked = relationshipSummary({
      story: story(),
      projectStories: [],
      relations: [rel(EStoryRelationType.BlockedBy)],
      linkCount: 0,
    });
    expect(blocked.hasBlockers).toBe(true);
  });

  it("treats links alone as non-empty", () => {
    const s = relationshipSummary({
      story: story(),
      projectStories: [],
      relations: [],
      linkCount: 1,
    });
    expect(s.isEmpty).toBe(false);
  });
});
