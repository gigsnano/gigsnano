import { describe, expect, it } from "vitest";

import { deriveIdentifier } from "./project-identifier";

describe("deriveIdentifier", () => {
  it("takes up to four uppercase initials", () => {
    expect(deriveIdentifier("  mobile banking app ")).toBe("MBA");
    expect(deriveIdentifier("a b c d e")).toBe("ABCD");
  });

  it("is empty for a blank name", () => {
    expect(deriveIdentifier("   ")).toBe("");
  });
});
