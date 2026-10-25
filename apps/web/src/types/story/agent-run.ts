/** Agent-run types (GIN-180) — mirror the API AgentRunOut / AgentResourceOut. */

export type EAgentAutonomy = "suggest" | "draft" | "autopilot";
export type EAgentRunState =
  | "queued"
  | "planning"
  | "executing"
  | "awaiting_review"
  | "done"
  | "failed"
  | "stopped";

export interface IAgentRunStep {
  id: string;
  seq: number;
  kind: "plan" | "tool" | "artifact" | "pr" | "note";
  status: string;
  summary: string;
  payload: Record<string, unknown>;
  tokens: number;
  created_at: string;
}

export interface IAgentRun {
  id: string;
  story_id: string;
  persona_id: string;
  autonomy: EAgentAutonomy;
  state: EAgentRunState;
  cost_tokens: number;
  cost_usd: number;
  created_at: string;
  updated_at: string;
  steps: IAgentRunStep[];
}

export interface IAgentResource {
  id: string;
  name: string;
  persona: string;
  phase: string;
  skills: string[];
  capacity: number;
  active_load: number;
  cost_tokens: number;
  cost_usd: number;
}

export interface ICreateRunPayload {
  persona_id?: string;
  autonomy: EAgentAutonomy;
}

/** Escrow/gig state for a work item (GIN-189). */
export interface IGigState {
  published: boolean;
  listing_id: string | null;
  escrow_state: "open" | "held" | "in_review" | "released" | "refunded" | null;
  amount_cents: number | null;
}

/** A ranked staffing candidate — AI persona or human freelancer (GIN-186/187). */
export interface IMatchCandidate {
  type: "agent" | "human";
  id: string;
  name: string;
  score: number;
  reason: string;
  est_rate: number | null;
}

/** Task-router recommendation (GIN-227/231). */
export interface IRouting {
  domain: string;
  task_type: string;
  persona_id: string;
  persona_name: string;
  skills: string[];
  confidence: string;
  rationale: string;
  citations: { type: string; ref: string }[];
}
