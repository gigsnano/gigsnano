import { describe, expect, it } from "vitest";

import { EJourneyPhase, EStepState, type IJourney, type IJourneyStep } from "@/types/journey/journey";

import { deriveJourneyState } from "./derive";

function step(over: Partial<IJourneyStep> & { id: string; phase: EJourneyPhase }): IJourneyStep {
  return {
    title: over.id,
    purpose: "",
    state: EStepState.NotStarted,
    applicable: true,
    prerequisites: [],
    skippable: false,
    inputs: [],
    decisions: [],
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

function journey(steps: IJourneyStep[]): IJourney {
  return { id: "j1", project_id: "p1", steps };
}

describe("deriveJourneyState", () => {
  it("recommends the first available step and locks steps with unmet prerequisites", () => {
    const j = journey([
      step({ id: "brief", phase: EJourneyPhase.Define, state: EStepState.Verified }),
      step({ id: "prd", phase: EJourneyPhase.Define, state: EStepState.Ready, prerequisites: ["brief"] }),
      step({ id: "ui", phase: EJourneyPhase.Experience, state: EStepState.NotStarted, prerequisites: ["prd"] }),
    ]);
    const v = deriveJourneyState(j);

    expect(v.nextAction?.step.id).toBe("prd");
    expect(v.locks.prd).toBeNull();
    expect(v.locks.ui).toContain("Blocked by");
    expect(v.blockers.map((b) => b.step.id)).toEqual(["ui"]);
  });

  it("surfaces needs-input / review / failed as attention and picks the earliest as next", () => {
    const j = journey([
      step({ id: "a", phase: EJourneyPhase.Define, state: EStepState.ReviewRequired }),
      step({ id: "b", phase: EJourneyPhase.Experience, state: EStepState.Failed }),
    ]);
    const v = deriveJourneyState(j);

    expect(v.attention.map((s) => s.id)).toEqual(["a", "b"]);
    expect(v.nextAction?.step.id).toBe("a");
    expect(v.nextAction?.reason).toMatch(/review/i);
  });

  it("rolls phases up: all-resolved = complete, earliest unfinished = active, rest upcoming", () => {
    const j = journey([
      step({ id: "d1", phase: EJourneyPhase.Define, state: EStepState.Verified }),
      step({ id: "d2", phase: EJourneyPhase.Define, state: EStepState.Skipped }),
      step({ id: "x1", phase: EJourneyPhase.Experience, state: EStepState.Ready }),
      step({ id: "e1", phase: EJourneyPhase.Engineer, state: EStepState.NotStarted, prerequisites: ["x1"] }),
    ]);
    const byPhase = Object.fromEntries(deriveJourneyState(j).phases.map((p) => [p.phase, p.state]));

    expect(byPhase[EJourneyPhase.Define]).toBe("complete");
    expect(byPhase[EJourneyPhase.Experience]).toBe("active");
    expect(byPhase[EJourneyPhase.Engineer]).toBe("upcoming");
  });

  it("counts verified progress from outcomes and excludes non-applicable steps", () => {
    const j = journey([
      step({ id: "a", phase: EJourneyPhase.Define, state: EStepState.Verified }),
      step({ id: "b", phase: EJourneyPhase.Define, state: EStepState.Ready }),
      step({ id: "ui", phase: EJourneyPhase.Experience, state: EStepState.NotStarted, applicable: false }),
    ]);
    const v = deriveJourneyState(j);

    expect(v.verifiedCount).toBe(1);
    expect(v.totalApplicable).toBe(2); // non-applicable ui excluded
    expect(v.locks.ui).toBeNull();
  });

  it("returns no next action when everything is resolved", () => {
    const j = journey([
      step({ id: "a", phase: EJourneyPhase.Define, state: EStepState.Verified }),
      step({ id: "b", phase: EJourneyPhase.Deliver, state: EStepState.Verified }),
    ]);
    const v = deriveJourneyState(j);

    expect(v.nextAction).toBeNull();
    expect(v.blockers).toEqual([]);
  });
});
