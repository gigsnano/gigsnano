import { describe, it, expect } from "vitest";

import { childTypesOf, canHaveChildren, defaultChildType } from "./story-hierarchy";
import { EStoryType } from "@/types";

describe("story-hierarchy (GIN-317)", () => {
  it("containers can have children; Task/Bug are leaves", () => {
    expect(canHaveChildren(EStoryType.Epic)).toBe(true);
    expect(canHaveChildren(EStoryType.Feature)).toBe(true);
    expect(canHaveChildren(EStoryType.Story)).toBe(true);
    expect(canHaveChildren(EStoryType.Task)).toBe(false);
    expect(canHaveChildren(EStoryType.Bug)).toBe(false);
  });

  it("narrows allowed child types down the hierarchy", () => {
    expect(childTypesOf(EStoryType.Epic)).toContain(EStoryType.Feature);
    expect(childTypesOf(EStoryType.Story)).toEqual([EStoryType.Task, EStoryType.Bug]);
    expect(childTypesOf(EStoryType.Task)).toEqual([]);
  });

  it("defaultChildType is the first allowed child, or null for a leaf", () => {
    expect(defaultChildType(EStoryType.Epic)).toBe(EStoryType.Feature);
    expect(defaultChildType(EStoryType.Story)).toBe(EStoryType.Task);
    expect(defaultChildType(EStoryType.Task)).toBeNull();
  });

  it("never lists a type as its own child (no trivial cycle)", () => {
    for (const t of Object.values(EStoryType)) {
      expect(childTypesOf(t)).not.toContain(t);
    }
  });
});
