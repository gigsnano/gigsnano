import { describe, expect, it } from "vitest";

import { communityColor } from "./community-color";

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe("communityColor", () => {
  it("is deterministic for the same key", () => {
    expect(communityColor("components")).toBe(communityColor("components"));
  });

  it("returns a hex color from the fixed palette", () => {
    // Palette-cycling means distinct keys may share a color (expected); the
    // contract is determinism + a valid palette hue, not global uniqueness.
    expect(communityColor("services")).toMatch(HEX);
  });
});
