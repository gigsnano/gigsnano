/** Execution Profile types (GIN-288) — mirror the API ExecutionProfileOut /
 * SkillEventOut contract (GIN-287/289). Snake_case to match the wire shape. */

export type EAgentTarget = "auto" | "claude-code" | "codex" | "cursor";

export type ESkillMode = "required" | "recommended" | "prohibited";

export interface IExecutionProfileSkill {
  skillId: string;
  version: string | null;
  digest: string | null;
  mode: ESkillMode;
  order: number;
  source: string;
  status: string;
  reason?: string;
}

export interface IExecutionProfileClassification {
  work_type: string;
  domains: string[];
  signals: string[];
}

export interface IExecutionProfileData {
  classification: IExecutionProfileClassification;
  skills: IExecutionProfileSkill[];
  gates: string[];
  policy: string;
  confidence: string;
  citations: unknown[];
}

/** One entry in `override_history` — an audited manual change to the profile. */
export interface IExecutionProfileOverrideEntry {
  reason: string;
  changes: unknown[];
}

export interface IExecutionProfileEnvelope {
  story_id: string;
  agent: EAgentTarget;
  policy: "suggest" | "locked";
  stale: boolean;
  profile: IExecutionProfileData;
  override_history: IExecutionProfileOverrideEntry[];
}

export interface IResolveExecutionProfilePayload {
  agent?: EAgentTarget;
  policy?: string;
}

export interface IOverrideExecutionProfilePayload {
  changes: { skillId: string; mode: ESkillMode | "removed" }[];
  reason: string;
}

/** Evidence timeline states — never conflate "planned/selected" with "ran". */
export type ESkillEventState =
  | "selected"
  | "resolved"
  | "downloaded"
  | "digest_verified"
  | "materialized"
  | "agent_acknowledged"
  | "agent_reported_invoked"
  | "gate_verified"
  | "failed"
  | "skipped"
  | "revoked";

export interface ISkillEvent {
  id: string;
  skill_id: string;
  state: ESkillEventState;
  version: string | null;
  digest: string | null;
  agent: string | null;
  gate: string | null;
  evidence: unknown[];
  reason: string | null;
}

export interface ISkillEventsResponse {
  events: ISkillEvent[];
  current_states: Record<string, ESkillEventState>;
}
