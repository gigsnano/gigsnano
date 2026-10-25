export enum EAiOperation {
  ProjectBrief = "project_brief",
  Prd = "prd",
  Architecture = "architecture",
  EpicsAndStories = "epics_and_stories",
  SprintPlanning = "sprint_planning",
  Ux = "ux",
  AgentDelegation = "agent_delegation",
  Finalize = "finalize",
  ChatTurn = "chat_turn",
}

/** One AI event as the user sees it. Money-primary: `cost_cents` is what UI reads. */
export interface IAiUsageLine {
  id: string;
  source: string; // e.g. "bmad_story" | "gigs_ai"
  operation: EAiOperation;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number; // may be fractional (sub-cent)
  project_id: string | null;
  story_id: string | null;
  thread_id: string | null;
  created_at: string;
}

/** Per-thread aggregate for the chat usage strip. */
export interface IThreadUsage {
  thread_id: string;
  total_cost_cents: number;
  message_count: number;
  lines: IAiUsageLine[];
}

export interface IUsageBreakdownEntry {
  id: string;
  name: string;
  cost_cents: number;
  event_count: number;
}

export interface IUsageTimeseriesPoint {
  date: string; // YYYY-MM-DD
  cost_cents: number;
}

/** Non-admin workspace usage dashboard shape (money-first sibling of admin ILlmUsageSummary). */
export interface IWorkspaceUsageSummary {
  period: { from: string; to: string };
  total_cost_cents: number;
  event_count: number;
  by_project: IUsageBreakdownEntry[];
  by_agent: IUsageBreakdownEntry[];
  by_member: IUsageBreakdownEntry[];
  timeseries: IUsageTimeseriesPoint[];
  prior_period?: { total_cost_cents: number; delta_cost_pct: number | null };
}

export interface ICostEstimate {
  low_cents: number;
  high_cents: number;
  typical_cents: number;
  basis: string;
}
