import { describe, expect, it } from "vitest";

import { IOS_COLOR_ROLES, IOS_COLORS, IOS_TINT_COLORS, IOS_TINTS, projectTint, withAlpha } from "./ios";
import { contrastRatio } from "./oklch";

describe("iOS tokens", () => {
  it("defines every colour role in both schemes", () => {
    for (const scheme of ["light", "dark"] as const) {
      expect(Object.keys(IOS_COLORS[scheme]).sort()).toEqual([...IOS_COLOR_ROLES].sort());
      expect(Object.keys(IOS_TINT_COLORS[scheme]).sort()).toEqual([...IOS_TINTS].sort());
    }
  });

  it("keeps primary labels readable on surfaces", () => {
    for (const scheme of ["light", "dark"] as const) {
      const c = IOS_COLORS[scheme];
      expect(contrastRatio(c.label, c.surface)).toBeGreaterThan(15);
    }
  });

  it("gives a project the same non-gray tint every time", () => {
    expect(projectTint("abc-123")).toBe(projectTint("abc-123"));
    for (const id of ["a", "b", "c", "d", "e", "f", "g", "h"]) expect(projectTint(id)).not.toBe("gray");
  });

  it("applies alpha to hex colours only", () => {
    expect(withAlpha("#FF3B30", 0.15)).toBe("rgba(255, 59, 48, 0.15)");
    expect(withAlpha("rgba(0, 0, 0, 0.4)", 0.2)).toBe("rgba(0, 0, 0, 0.4)");
  });
});
