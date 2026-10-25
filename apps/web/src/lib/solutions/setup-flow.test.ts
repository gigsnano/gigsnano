import { describe, expect, it } from "vitest";

import {
  EProjectFlow,
  ESolutionAvailability,
  ESolutionCapability,
  ESolutionKey,
  type ISetupDraft,
  type ISolutionDefinition,
} from "@/types";

import {
  ECreateStep,
  SETUP_DRAFT_STEP,
  canResumeDraft,
  flowForStartingPoint,
  resumeStep,
} from "./setup-flow";

function makeSolution(overrides: Partial<ISolutionDefinition> = {}): ISolutionDefinition {
  return {
    key: ESolutionKey.SoftwareDelivery,
    version: 3,
    name: "Software Delivery",
    outcome: "Build and operate production-ready software",
    description: "…",
    container_noun: "project",
    capabilities: [ESolutionCapability.Repositories],
    starting_points: [
      { key: "idea", label: "Start from an idea", hint: "…", recommended: true, requires_capability: null },
    ],
    navigation: [{ key: "overview", label: "Overview", path: "", requires_capability: null }],
    availability: ESolutionAvailability.Available,
    availability_reason: null,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<ISetupDraft> = {}): ISetupDraft {
  return {
    id: "draft_1",
    workspace_slug: "acme",
    solution_key: ESolutionKey.SoftwareDelivery,
    solution_version: 3,
    starting_point: "idea",
    step: SETUP_DRAFT_STEP,
    values: {},
    created_by: "usr_1",
    revision: 1,
    created_at: "2026-07-25T10:00:00Z",
    updated_at: "2026-07-25T10:05:00Z",
    expires_at: "2026-08-24T10:00:00Z",
    ...overrides,
  };
}

describe("canResumeDraft", () => {
  it("allows a fresh draft on an available solution", () => {
    expect(canResumeDraft(makeDraft(), makeSolution())).toBe(true);
  });

  it("refuses a draft whose solution the workspace no longer offers", () => {
    expect(canResumeDraft(makeDraft(), null)).toBe(false);
  });

  it("refuses a draft whose solution was switched off", () => {
    const solution = makeSolution({
      availability: ESolutionAvailability.Disabled,
      availability_reason: "Pilot only.",
    });
    expect(canResumeDraft(makeDraft(), solution)).toBe(false);
  });

  it("refuses a draft written against an older definition version", () => {
    expect(canResumeDraft(makeDraft({ solution_version: 2 }), makeSolution())).toBe(false);
  });
});

describe("resumeStep", () => {
  it("returns to the exact step the draft recorded", () => {
    expect(resumeStep(makeDraft(), makeSolution())).toBe(ECreateStep.Setup);
  });

  it("falls back to the chooser for a step this slice does not implement", () => {
    expect(resumeStep(makeDraft({ step: "connect" }), makeSolution())).toBe(ECreateStep.Solution);
  });

  it("falls back to the chooser when the draft cannot be resumed at all", () => {
    expect(resumeStep(makeDraft({ solution_version: 1 }), makeSolution())).toBe(
      ECreateStep.Solution,
    );
  });
});

describe("flowForStartingPoint", () => {
  it.each([
    ["repository", EProjectFlow.Existing],
    ["in_flight", EProjectFlow.Existing],
    ["idea", EProjectFlow.Fresh],
    ["documents", EProjectFlow.Fresh],
    ["blueprint", EProjectFlow.Fresh],
    ["blank", EProjectFlow.Fresh],
  ])("%s → %s", (startingPoint, expected) => {
    expect(flowForStartingPoint(startingPoint)).toBe(expected);
  });

  it("defaults to greenfield when no starting point was recorded", () => {
    expect(flowForStartingPoint(null)).toBe(EProjectFlow.Fresh);
  });
});
