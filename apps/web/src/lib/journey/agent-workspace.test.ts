import { describe, expect, it } from "vitest";

import { EJourneyPhase, EStepState, type IJourney, type IJourneyStep } from "@/types/journey/journey";

import { nextStepAfter } from "./agent-workspace";

function step(over: Partial<IJourneyStep> & { id: string; phase: EJourneyPhase }): IJourneyStep {
  return {
    title: over.id,
    purpose: "Do the thing.",
    state: EStepState.Ready,
    applicable: true,
    prerequisites: [],
    skippable: false,
    inputs: [],
    decisions: [],
    updated_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

describe("nextStepAfter", () => {
  const journey: IJourney = {
    id: "j1",
    project_id: "p1",
    steps: [
      step({ id: "d", phase: EJourneyPhase.Define }),
      step({ id: "x", phase: EJourneyPhase.Experience }),
      step({ id: "hidden", phase: EJourneyPhase.Experience, applicable: false }),
      step({ id: "e", phase: EJourneyPhase.Engineer }),
    ],
  };

  it("returns the next applicable step in phase order", () => {
    expect(nextStepAfter(journey, "d")?.id).toBe("x");
    expect(nextStepAfter(journey, "x")?.id).toBe("e"); // skips non-applicable
  });

  it("returns null for the last step or an unknown id", () => {
    expect(nextStepAfter(journey, "e")).toBeNull();
    expect(nextStepAfter(journey, "nope")).toBeNull();
  });
});
