import { EJourneyPhase, type IJourney, type IJourneyStep } from "@/types/journey/journey";

import { JOURNEY_PHASE_ORDER } from "./derive";

/** Recommended specialist persona per phase (GIN-433 agent assignment). */
export const PHASE_PERSONA: Record<EJourneyPhase, string> = {
  [EJourneyPhase.Define]: "Product Analyst",
  [EJourneyPhase.Experience]: "UX Strategist",
  [EJourneyPhase.Engineer]: "Architect",
  [EJourneyPhase.Plan]: "Delivery Planner",
  [EJourneyPhase.Deliver]: "Delivery Planner",
};

/** The applicable step immediately after `stepId` in phase → order sequence, or null. */
export function nextStepAfter(journey: IJourney, stepId: string): IJourneyStep | null {
  const ordered = [...journey.steps]
    .filter((s) => s.applicable)
    .sort((a, b) => JOURNEY_PHASE_ORDER.indexOf(a.phase) - JOURNEY_PHASE_ORDER.indexOf(b.phase));
  const idx = ordered.findIndex((s) => s.id === stepId);
  if (idx < 0 || idx + 1 >= ordered.length) return null;
  return ordered[idx + 1];
}
