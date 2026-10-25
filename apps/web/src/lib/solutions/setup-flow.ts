import { EProjectFlow, type ISetupDraft, type ISolutionDefinition } from "@/types";

import { isDraftStale, isSolutionSelectable } from "./registry";

/**
 * Decisions the create flow makes about *where* a user lands (GIN-446). Kept
 * pure and separate from the dialog so "resumes the exact step" is a testable
 * claim rather than a behaviour buried in a component.
 */

/** The two steps this slice implements. GIN-450 expands the setup step. */
export enum ECreateStep {
  Solution = "solution",
  Setup = "setup",
}

/** The draft `step` value meaning "the solution's own setup form". */
export const SETUP_DRAFT_STEP = "setup";

/**
 * A draft may only be resumed into its setup step when its solution is still
 * selectable and its definition hasn't moved on. Anything else sends the user
 * back to the chooser rather than replaying stale answers.
 */
export function canResumeDraft(
  draft: ISetupDraft,
  solution: ISolutionDefinition | null,
): boolean {
  if (!solution) return false;
  return isSolutionSelectable(solution) && !isDraftStale(draft, solution);
}

export function resumeStep(
  draft: ISetupDraft,
  solution: ISolutionDefinition | null,
): ECreateStep {
  if (!canResumeDraft(draft, solution)) return ECreateStep.Solution;
  return draft.step === SETUP_DRAFT_STEP ? ECreateStep.Setup : ECreateStep.Solution;
}

/**
 * Map a Software Delivery starting point onto the existing greenfield/brownfield
 * flag. The starting points are the richer model (GIN-444); `EProjectFlow` is
 * what the project API still takes, so this is the adapter between them.
 */
export function flowForStartingPoint(startingPoint: string | null): EProjectFlow {
  return startingPoint === "repository" || startingPoint === "in_flight"
    ? EProjectFlow.Existing
    : EProjectFlow.Fresh;
}
