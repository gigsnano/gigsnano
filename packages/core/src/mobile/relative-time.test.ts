import { describe, expect, it } from "vitest";

import { relativeTime } from "./relative-time";

const NOW = Date.parse("2026-10-17T12:00:00Z");

describe("relativeTime", () => {
  it.each([
    [NOW - 20_000, "just now"],
    [NOW - 5 * 60_000, "5m ago"],
    [NOW - 3 * 3_600_000, "3h ago"],
    [NOW - 2 * 86_400_000, "2d ago"],
    [NOW + 60_000, "just now"],
  ])("%s -> %s", (t, expected) => {
    expect(relativeTime(t, NOW)).toBe(expected);
  });
});
