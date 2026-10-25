import { describe, expect, it } from "vitest";

import { EIntakeStepStatus } from "@/types/solution/intake";

import { softwareDeliveryIntake, revenueAssuranceIntake } from "./definitions";
import {
  beginStep,
  changeStartingPoint,
  completeStep,
  deferStep,
  initialIntakeState,
  patchValues,
  previewStartingPointChange,
  progressOf,
  resolveStepStatuses,
  waiveStep,
} from "./machine";

/** Walk a path to completion, asserting each current_step along the way. */
function walk(
  definition: typeof softwareDeliveryIntake,
  startingPoint: string,
  expectedSteps: string[],
) {
  let state = initialIntakeState(definition, startingPoint);
  for (const stepKey of expectedSteps) {
    expect(state.current_step).toBe(stepKey);
    state = beginStep(state, stepKey);
    state = completeStep(definition, state, stepKey, { [`${stepKey}_done`]: true });
  }
  expect(state.current_step).toBeNull();
  const progress = progressOf(definition, state);
  expect(progress.next_action).toBeNull();
  expect(progress.ratio).toBe(1);
  return state;
}

describe("Software Delivery transition matrix", () => {
  it.each([
    [
      "idea",
      ["start", "context", "vision", "structure", "blueprint", "connect", "own", "create"],
    ],
    [
      "documents",
      ["start", "context", "vision", "structure", "blueprint", "connect", "own", "create"],
    ],
    [
      "blueprint",
      ["start", "context", "vision", "structure", "blueprint", "connect", "own", "create"],
    ],
    [
      "repository",
      ["start", "context", "repository", "structure", "blueprint", "connect", "own", "create"],
    ],
    [
      "in_flight",
      ["start", "context", "repository", "structure", "blueprint", "connect", "own", "create"],
    ],
    // Blank skips generated setup — reduced automation, not a brick wall.
    ["blank", ["start", "context", "create"]],
  ])("%s walks %j", (startingPoint, expected) => {
    walk(softwareDeliveryIntake, startingPoint, expected);
  });

  it("marks the blank path as reduced automation with an explanatory notice", () => {
    const state = initialIntakeState(softwareDeliveryIntake, "blank");
    const progress = progressOf(softwareDeliveryIntake, state);
    expect(progress.reduced_automation).toBe(true);
    expect(progress.notice).toMatch(/blank project/i);
  });

  it("skips greenfield-only questions on the repository path", () => {
    const state = initialIntakeState(softwareDeliveryIntake, "repository");
    const statuses = resolveStepStatuses(softwareDeliveryIntake, state);
    expect(statuses.vision).toBe(EIntakeStepStatus.Skipped);
    expect(statuses.repository).not.toBe(EIntakeStepStatus.Skipped);
  });
});

describe("Revenue Assurance transition matrix", () => {
  it.each([
    ["diagnostic", ["start", "scope", "import_files", "sources", "controls", "review"]],
    ["import", ["start", "scope", "import_files", "controls", "review"]],
    ["sources", ["start", "scope", "sources", "controls", "review"]],
    ["blueprint", ["start", "scope", "sources", "controls", "review"]],
  ])("%s walks %j", (startingPoint, expected) => {
    walk(revenueAssuranceIntake, startingPoint, expected);
  });
});

describe("required steps and waivers", () => {
  it("refuses to defer a required non-deferrable step", () => {
    const state = initialIntakeState(softwareDeliveryIntake, "idea");
    expect(() => deferStep(softwareDeliveryIntake, state, "start")).toThrow(/required/i);
  });

  it("refuses a waiver without a rationale", () => {
    let state = initialIntakeState(softwareDeliveryIntake, "idea");
    state = completeStep(softwareDeliveryIntake, state, "start");
    expect(() => waiveStep(softwareDeliveryIntake, state, "context", "  ")).toThrow(/rationale/i);
  });

  it("allows waiving context with a rationale and advances", () => {
    let state = initialIntakeState(softwareDeliveryIntake, "blank");
    state = completeStep(softwareDeliveryIntake, state, "start");
    state = waiveStep(softwareDeliveryIntake, state, "context", "Migrating from a spreadsheet");
    expect(state.records.context.status).toBe(EIntakeStepStatus.Waived);
    expect(state.records.context.waiver_rationale).toMatch(/spreadsheet/i);
    expect(state.current_step).toBe("create");
  });
});

describe("material-answer invalidation", () => {
  it("invalidates downstream steps when a material value changes", () => {
    let state = initialIntakeState(softwareDeliveryIntake, "blank");
    state = completeStep(softwareDeliveryIntake, state, "start");
    state = completeStep(softwareDeliveryIntake, state, "context", {
      name: "Alpha",
      description: "first",
    });
    expect(state.current_step).toBe("create");

    state = patchValues(softwareDeliveryIntake, state, { name: "Beta" });
    expect(state.records.context.status).toBe(EIntakeStepStatus.Invalidated);
    expect(state.current_step).toBe("context");
  });

  it("does not invalidate when an immaterial value changes", () => {
    let state = initialIntakeState(softwareDeliveryIntake, "blank");
    state = completeStep(softwareDeliveryIntake, state, "start");
    state = completeStep(softwareDeliveryIntake, state, "context", { name: "Alpha" });
    state = patchValues(softwareDeliveryIntake, state, { colour: "blue" });
    expect(state.records.context.status).toBe(EIntakeStepStatus.Complete);
    expect(state.current_step).toBe("create");
  });
});

describe("starting-point change", () => {
  it("previews the affected steps and values before resetting", () => {
    let state = initialIntakeState(softwareDeliveryIntake, "idea");
    state = completeStep(softwareDeliveryIntake, state, "start");
    state = completeStep(softwareDeliveryIntake, state, "context", { name: "Alpha" });
    const preview = previewStartingPointChange(softwareDeliveryIntake, state, "repository");
    expect(preview.from).toBe("idea");
    expect(preview.to).toBe("repository");
    expect(preview.affected_steps.length).toBeGreaterThan(0);
    expect(preview.affected_values).toContain("name");
  });

  it("resets to a clean state for the new path when applied", () => {
    let state = initialIntakeState(softwareDeliveryIntake, "idea");
    state = completeStep(softwareDeliveryIntake, state, "start");
    state = completeStep(softwareDeliveryIntake, state, "context", { name: "Alpha" });
    state = changeStartingPoint(softwareDeliveryIntake, state, "blank");
    expect(state.starting_point).toBe("blank");
    expect(state.values).toEqual({});
    expect(state.current_step).toBe("start");
    expect(progressOf(softwareDeliveryIntake, state).reduced_automation).toBe(true);
  });
});
