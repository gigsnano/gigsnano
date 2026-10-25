import { describe, expect, it } from "vitest";

import {
  DIRECTIONS,
  DEFAULT_TOKENS,
  applyDirection,
  screensFor,
  buildExperienceContract,
} from "./experience";

describe("applyDirection", () => {
  it("overlays the direction's characteristic tokens but keeps theme/motion", () => {
    const start = { ...DEFAULT_TOKENS, theme: "dark" as const, motion: "expressive" as const };
    const dense = DIRECTIONS.find((d) => d.id === "dense")!;
    const next = applyDirection(start, dense);
    expect(next.density).toBe("compact");
    expect(next.accent).toBe(dense.tokens.accent);
    expect(next.theme).toBe("dark"); // preserved
    expect(next.motion).toBe("expressive"); // preserved
  });
});

describe("screensFor", () => {
  it("always includes the shell + overview, then template screens", () => {
    const s = screensFor("marketplace");
    expect(s.slice(0, 2)).toEqual(["App shell", "Home / overview"]);
    expect(s).toContain("Checkout");
  });

  it("returns just the common screens for blank / unknown templates", () => {
    expect(screensFor("blank")).toEqual(["App shell", "Home / overview"]);
    expect(screensFor("nope")).toEqual(["App shell", "Home / overview"]);
  });
});

describe("buildExperienceContract", () => {
  it("captures direction, template, tokens, screens, approver and open decisions", () => {
    const c = buildExperienceContract({
      version: 3,
      direction: DIRECTIONS[0],
      templateId: "saas-dashboard",
      tokens: DEFAULT_TOKENS,
      approver: "Ada",
      openDecisions: ["Motion level"],
    });
    expect(c.version).toBe(3);
    expect(c.directionName).toBe("Calm enterprise");
    expect(c.screens).toContain("Dashboard");
    expect(c.approver).toBe("Ada");
    expect(c.openDecisions).toEqual(["Motion level"]);
  });
});
