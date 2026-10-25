import type { ID, ISODateString } from "@/types/common";

/** Outcome-oriented setup phases (GIN-427/428). */
export enum EJourneyPhase {
  Define = "define",
  Experience = "experience",
  Engineer = "engineer",
  Plan = "plan",
  Deliver = "deliver",
}

/**
 * Journey-execution state — deliberately SEPARATE from work-item status
 * (`EStoryStatus`). A manual status change can never set `Verified` here;
 * verification comes from an approved output contract.
 */
export enum EStepState {
  NotStarted = "not_started",
  Ready = "ready",
  InProgress = "in_progress",
  NeedsInput = "needs_input",
  ReviewRequired = "review_required",
  Blocked = "blocked",
  Failed = "failed",
  Verified = "verified",
  Superseded = "superseded",
  Skipped = "skipped",
}

/** Who is doing the step's work (GIN-427 executor selection). */
export enum EExecutor {
  Self = "self",
  Team = "team",
  Expert = "expert",
  Ai = "ai",
}

export interface IJourneyStepOutput {
  label: string;
  /** Output-contract type, e.g. "product_brief", "experience_contract". */
  type: string;
  version: number;
  verified: boolean;
}

export interface IJourneyStep {
  id: ID;
  phase: EJourneyPhase;
  title: string;
  purpose: string;
  state: EStepState;
  /** Data-driven applicability — e.g. UI-only steps for non-UI projects. */
  applicable: boolean;
  /** Step ids that must be Verified before this unlocks. */
  prerequisites: ID[];
  /** Optional step; may be skipped with recorded rationale. */
  skippable: boolean;
  inputs: string[];
  decisions: { label: string; value?: string }[];
  output?: IJourneyStepOutput;
  executor?: EExecutor;
  /** Human effort estimate for the active-step panel, e.g. "~10 min". */
  effort?: string;
  approver?: string;
  /** Labels of downstream artifacts invalidated if this step's output changes. */
  downstream_impact?: string[];
  /** Specialized editing surface this step opens (beyond the generic workspace). */
  surface?: "experience" | "topology" | "delivery";
  updated_at: ISODateString;
}

export interface IJourney {
  id: ID;
  project_id: ID;
  steps: IJourneyStep[];
}
