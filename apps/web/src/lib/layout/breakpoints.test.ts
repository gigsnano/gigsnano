import { afterEach, describe, expect, it, vi } from "vitest";

import { BREAKPOINTS, isBelow, maxWidth, minWidth } from "./breakpoints";

describe("breakpoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mirrors Tailwind v4's default scale", () => {
    expect(BREAKPOINTS).toEqual({ sm: 40, md: 48, lg: 64, xl: 80 });
  });

  it("builds range queries that split exactly at the breakpoint", () => {
    expect(minWidth("md")).toBe("(width >= 48rem)");
    expect(maxWidth("md")).toBe("(width < 48rem)");
    expect(maxWidth("lg")).toBe("(width < 64rem)");
  });

  it("is false on the server", () => {
    expect(isBelow("md")).toBe(false);
  });

  it("asks matchMedia for the below-breakpoint query", () => {
    const matchMedia = vi.fn((q: string) => ({ matches: q === "(width < 48rem)" }));
    vi.stubGlobal("window", { matchMedia });
    expect(isBelow("md")).toBe(true);
    expect(isBelow("lg")).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith("(width < 64rem)");
  });
});
