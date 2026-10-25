import { describe, expect, it } from "vitest";

import { isBelowMinVersion } from "./version";

describe("isBelowMinVersion", () => {
  it.each([
    ["1.0.0", "1.0.0", false],
    ["1.0.0", "1.0.1", true],
    ["1.10.0", "1.9.9", false],
    ["2.0", "1.9.9", false],
    ["x", "1.0.0", true],
  ])("current %s vs min %s -> %s", (current, min, expected) => {
    expect(isBelowMinVersion(current, min)).toBe(expected);
  });
});
