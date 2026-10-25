import { EAiOperation } from "@/types/billing/ai-cost";

/**
 * Cost catalog for estimatable operations (cents).
 *
 * Measured from prod `llm_usage_events` on 2026-07-17: min / median / max of the
 * repriced total cost per generated doc, grouped by BMAD workflow. The previous
 * values were invented and ran 3–6x high (PRD claimed 18c typical; the median is 3c).
 * That mattered — `high_cents` gates the "Top up to run" prompt, so an inflated high
 * told people to top up for work they could already afford.
 *
 * ponytail: a static table refreshed by re-measuring, not the endpoint GIN-150 asks
 * for. n=4..7 per workflow, so server-computed percentiles would be false precision
 * with a network call attached. Build the endpoint when per-workspace costs diverge
 * enough that one shared catalog misleads.
 */
export const AI_OPERATION_COSTS: Record<
  EAiOperation,
  { typical_cents: number; low_cents: number; high_cents: number }
> = {
  // n=4. The 25c high is a real observed run — keep it. Understating the high starts
  // a job the wallet can't finish, which is the worse failure.
  [EAiOperation.ProjectBrief]: { typical_cents: 2, low_cents: 1, high_cents: 25 },
  [EAiOperation.Prd]: { typical_cents: 3, low_cents: 2, high_cents: 8 }, // n=7
  [EAiOperation.Architecture]: { typical_cents: 7, low_cents: 5, high_cents: 8 }, // n=6
  [EAiOperation.EpicsAndStories]: { typical_cents: 7, low_cents: 6, high_cents: 8 }, // n=4
  // n=1 — widened rather than published as a point estimate.
  [EAiOperation.SprintPlanning]: { typical_cents: 3, low_cents: 2, high_cents: 6 },
  [EAiOperation.Ux]: { typical_cents: 3, low_cents: 1, high_cents: 9 }, // n=5
  // The default from bmadWorkflowToOperation, so it covers every other workflow
  // (brainstorming, document-project, generate-context, readiness, research). n=16.
  [EAiOperation.Finalize]: { typical_cents: 3, low_cents: 1, high_cents: 9 },
  // Unreachable: bmadWorkflowToOperation never returns these and nothing else calls
  // useCostEstimate, so these are left alone rather than fitted to a hint nobody
  // renders. If ChatTurn is ever shown, note measured turns run 0.1c–207c (Opus with
  // a large context) — this row would be badly wrong at the tail.
  [EAiOperation.AgentDelegation]: { typical_cents: 25, low_cents: 12, high_cents: 50 },
  [EAiOperation.ChatTurn]: { typical_cents: 1, low_cents: 0, high_cents: 3 },
};

export const AI_OPERATION_BASIS: Record<EAiOperation, string> = {
  [EAiOperation.ProjectBrief]: "Project brief generation",
  [EAiOperation.Prd]: "PRD generation",
  [EAiOperation.Architecture]: "Architecture doc generation",
  [EAiOperation.EpicsAndStories]: "Epics & stories generation",
  [EAiOperation.SprintPlanning]: "Sprint plan generation",
  [EAiOperation.Ux]: "UX spec generation",
  [EAiOperation.AgentDelegation]: "Coding-agent delegation run",
  [EAiOperation.Finalize]: "Finalize document",
  [EAiOperation.ChatTurn]: "Chat reply",
};
