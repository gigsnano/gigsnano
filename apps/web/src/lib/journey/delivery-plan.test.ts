import { describe, expect, it } from "vitest";

import { seedDeliveryPlan, assessReadiness, proposeFirstCycle, type IDeliveryPlan } from "./delivery-plan";

describe("assessReadiness", () => {
  it("flags the seed's unowned + untested tasks as CONCERNS with full coverage", () => {
    const r = assessReadiness(seedDeliveryPlan());
    expect(r.result).toBe("CONCERNS");
    expect(r.coveragePct).toBe(100);
    expect(r.totals).toEqual({ epics: 2, stories: 3, tasks: 10 });
    expect(r.issues.some((i) => /unowned/i.test(i.message))).toBe(true);
    expect(r.issues.some((i) => /contract test/i.test(i.message))).toBe(true);
    expect(r.issues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("FAILs when an approved-screen story has no frontend work", () => {
    const plan: IDeliveryPlan = {
      epics: [
        {
          id: "e",
          title: "E",
          stories: [
            {
              id: "s",
              title: "Screen-only story",
              outcome: "",
              screens: ["Home"],
              tasks: [{ id: "t", layer: "api", title: "API", owner: "T", hasTest: true, kind: "feature" }],
            },
          ],
        },
      ],
    };
    const r = assessReadiness(plan);
    expect(r.result).toBe("FAIL");
    expect(r.coveragePct).toBe(0);
  });
});

describe("proposeFirstCycle", () => {
  it("picks foundation enablers plus the first vertical slice", () => {
    const cycle = proposeFirstCycle(seedDeliveryPlan());
    const ids = cycle.stories.map((s) => s.id);
    expect(ids).toContain("s-foundation");
    expect(ids).toContain("s-signup");
  });
});
