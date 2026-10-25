import type { ID } from "@/types/common";
import {
  EJourneyPhase,
  EStepState,
  type IJourney,
  type IJourneyStep,
  type IJourneyStepOutput,
} from "@/types/journey/journey";

export const JOURNEY_PHASE_ORDER: EJourneyPhase[] = [
  EJourneyPhase.Define,
  EJourneyPhase.Experience,
  EJourneyPhase.Engineer,
  EJourneyPhase.Plan,
  EJourneyPhase.Deliver,
];

export const JOURNEY_PHASE_LABEL: Record<EJourneyPhase, string> = {
  [EJourneyPhase.Define]: "Define",
  [EJourneyPhase.Experience]: "Experience",
  [EJourneyPhase.Engineer]: "Engineer",
  [EJourneyPhase.Plan]: "Plan",
  [EJourneyPhase.Deliver]: "Deliver",
};

/** Resolved = no longer needs work (drops out of "available" and blockers). */
const RESOLVED = new Set<EStepState>([
  EStepState.Verified,
  EStepState.Skipped,
  EStepState.Superseded,
]);

export function isResolved(state: EStepState): boolean {
  return RESOLVED.has(state);
}

export type PhaseView = {
  phase: EJourneyPhase;
  state: "complete" | "active" | "upcoming";
  verified: number;
  total: number;
};

export interface IJourneyView {
  verifiedCount: number;
  totalApplicable: number;
  phases: PhaseView[];
  /** The single recommended next action; null when nothing is available. */
  nextAction: { step: IJourneyStep; reason: string } | null;
  blockers: { step: IJourneyStep; reason: string }[];
  attention: IJourneyStep[];
  recentOutputs: IJourneyStepOutput[];
  /** Per-step lock reason (null when unlocked). Locked = has an unmet prerequisite. */
  locks: Record<ID, string | null>;
}

function reasonForNext(step: IJourneyStep): string {
  switch (step.state) {
    case EStepState.NeedsInput:
      return "Waiting on your input to continue.";
    case EStepState.ReviewRequired:
      return "An output is ready for your review and approval.";
    case EStepState.InProgress:
      return "Pick up where you left off.";
    case EStepState.Failed:
      return "The last run failed — retry or recover it.";
    default:
      return `This is the next step in ${JOURNEY_PHASE_LABEL[step.phase]}.`;
  }
}

/**
 * Derive the guidance view from a journey (GIN-428). Pure and deterministic —
 * no clock, no randomness — so the recommended action and progress are stable
 * and unit-testable. Verified progress is computed from step outcomes, never
 * from work-item status.
 */
export function deriveJourneyState(journey: IJourney): IJourneyView {
  const byId = new Map<ID, IJourneyStep>(journey.steps.map((s) => [s.id, s]));

  const prereqsVerified = (step: IJourneyStep) =>
    step.prerequisites.every((id) => byId.get(id)?.state === EStepState.Verified);

  const firstUnmet = (step: IJourneyStep) =>
    step.prerequisites.find((id) => byId.get(id)?.state !== EStepState.Verified);

  const locks: Record<ID, string | null> = {};
  const blockers: { step: IJourneyStep; reason: string }[] = [];
  const attention: IJourneyStep[] = [];
  let nextAction: { step: IJourneyStep; reason: string } | null = null;

  // Walk in phase order, then declaration order, so "first available" is stable.
  const ordered = [...journey.steps].sort(
    (a, b) => JOURNEY_PHASE_ORDER.indexOf(a.phase) - JOURNEY_PHASE_ORDER.indexOf(b.phase),
  );

  for (const step of ordered) {
    if (!step.applicable) {
      locks[step.id] = null;
      continue;
    }
    const resolved = isResolved(step.state);
    const ready = prereqsVerified(step);

    if (!resolved && !ready) {
      const blockerTitle = byId.get(firstUnmet(step)!)?.title ?? "an earlier step";
      const reason = `Blocked by ${blockerTitle}`;
      locks[step.id] = reason;
      blockers.push({ step, reason });
      continue;
    }
    locks[step.id] = null;

    if (resolved) continue;

    // Available (applicable, unresolved, prerequisites met).
    if (
      step.state === EStepState.NeedsInput ||
      step.state === EStepState.ReviewRequired ||
      step.state === EStepState.Failed
    ) {
      attention.push(step);
    }
    if (!nextAction) nextAction = { step, reason: reasonForNext(step) };
  }

  // Phase roll-up over applicable steps.
  const phases: PhaseView[] = JOURNEY_PHASE_ORDER.map((phase) => {
    const steps = journey.steps.filter((s) => s.applicable && s.phase === phase);
    const verified = steps.filter((s) => s.state === EStepState.Verified).length;
    const complete = steps.length > 0 && steps.every((s) => isResolved(s.state));
    return { phase, state: complete ? "complete" : "upcoming", verified, total: steps.length };
  });
  const activeIdx = phases.findIndex((p) => p.state !== "complete" && p.total > 0);
  if (activeIdx >= 0) phases[activeIdx].state = "active";

  const applicable = journey.steps.filter((s) => s.applicable);
  const recentOutputs = journey.steps
    .filter((s) => s.output)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((s) => s.output!);

  return {
    verifiedCount: applicable.filter((s) => s.state === EStepState.Verified).length,
    totalApplicable: applicable.length,
    phases,
    nextAction,
    blockers,
    attention,
    recentOutputs,
    locks,
  };
}
