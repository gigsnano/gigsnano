import { describe, expect, it } from "vitest";

import { contrastRatio, oklchToCss } from "./oklch";

describe("oklchToCss", () => {
  it("converts the sRGB corners", () => {
    expect(oklchToCss("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToCss("oklch(0 0 0)")).toBe("#000000");
    expect(oklchToCss("oklch(0.627955 0.257683 29.2339)")).toBe("#ff0000");
  });

  it("keeps alpha as rgba", () => {
    expect(oklchToCss("oklch(1 0 0 / 10%)")).toBe("rgba(255, 255, 255, 0.1)");
    expect(oklchToCss("oklch(0.1482 0.0034 196.79 / 30%)")).toMatch(/^rgba\(\d+, \d+, \d+, 0\.3\)$/);
  });

  it("rejects anything that is not oklch", () => {
    expect(() => oklchToCss("#fff")).toThrow();
  });
});

describe("contrastRatio", () => {
  it("matches WCAG for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
