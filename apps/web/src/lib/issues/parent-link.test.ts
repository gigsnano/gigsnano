import { describe, expect, it } from "vitest";

import { canLinkAsChild } from "./parent-link";
import type { IStory } from "@/types";

function story(partial: Partial<IStory> & { id: string }): IStory {
  return { parent_id: null, bmad: null, ...partial } as IStory;
}

const A = story({ id: "a" });
const B = story({ id: "b" });
const childOfA = story({ id: "c", parent_id: "a" });
const grandchildOfA = story({ id: "d", parent_id: "c" });
const bmadStory = story({ id: "z", bmad: { workflow: "prd" } as IStory["bmad"] });

describe("canLinkAsChild", () => {
  it("allows linking two unrelated root items", () => {
    expect(canLinkAsChild("a", "b", [A, B])).toBe(true);
  });

  it("rejects linking an item onto itself", () => {
    expect(canLinkAsChild("a", "a", [A])).toBe(false);
  });

  it("rejects an item that is already a direct child of the target", () => {
    expect(canLinkAsChild("c", "a", [A, childOfA])).toBe(false);
  });

  it("rejects a target that descends from the source (cycle guard)", () => {
    // Linking A under its own grandchild would create a cycle.
    expect(canLinkAsChild("a", "d", [A, childOfA, grandchildOfA])).toBe(false);
    expect(canLinkAsChild("a", "c", [A, childOfA, grandchildOfA])).toBe(false);
  });

  it("allows re-parenting a child under a different unrelated item", () => {
    expect(canLinkAsChild("c", "b", [A, B, childOfA])).toBe(true);
  });

  it("rejects a BMAD planning story as the source", () => {
    expect(canLinkAsChild("z", "a", [A, bmadStory])).toBe(false);
  });

  it("rejects when either story is missing from the set", () => {
    expect(canLinkAsChild("a", "missing", [A])).toBe(false);
    expect(canLinkAsChild("missing", "a", [A])).toBe(false);
  });
});
