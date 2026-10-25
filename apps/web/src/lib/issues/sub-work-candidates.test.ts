import { describe, expect, it } from "vitest";

import { subWorkLinkCandidates } from "./sub-work-candidates";
import type { IStory } from "@/types";

function story(id: string, parent_id: string | null = null): IStory {
  return {
    id,
    parent_id,
    bmad: null,
    title: id,
  } as IStory;
}

describe("subWorkLinkCandidates", () => {
  it("excludes self, existing children, ancestors, and BMAD items", () => {
    const parent = story("p");
    const child = story("c", "p");
    const grandparent = story("gp");
    const parentWithGp = { ...parent, parent_id: "gp" } as IStory;
    const bmad = { ...story("b"), bmad: "prd" } as unknown as IStory;
    const unrelated = story("u");
    const stories = [grandparent, parentWithGp, child, bmad, unrelated];

    const ids = subWorkLinkCandidates(stories, parentWithGp).map((s) => s.id);

    expect(ids).toEqual(["u"]);
    expect(ids).not.toContain("p");
    expect(ids).not.toContain("c");
    expect(ids).not.toContain("gp");
    expect(ids).not.toContain("b");
  });
});
