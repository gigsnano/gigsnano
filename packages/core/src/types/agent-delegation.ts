import type { ID, ISODateString } from "./common";

export enum EAgentProvider {
  Cursor = "cursor",
  Codex = "codex",
  ClaudeCode = "claude_code",
}

export enum EAgentConnectionStatus {
  Connected = "connected",
  Expired = "expired",
  Revoked = "revoked",
}

/** A per-user link to an external coding-agent account. No token on the client. */
export interface IAgentConnection {
  id: ID;
  user_id: ID;
  provider: EAgentProvider;
  account_label: string;
  status: EAgentConnectionStatus;
  connected_at: ISODateString;
}

export enum EDelegationStatus {
  Queued = "queued",
  Running = "running",
  AwaitingReview = "awaiting_review",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

export enum EDelegationUnit {
  WorkItem = "work_item",
  BmadCard = "bmad_card",
}

/** Discriminated result: code/PR for work items, a doc for BMAD cards. */
export type IDelegationResult =
  | { kind: "pr"; pr_url: string; branch: string }
  | { kind: "document"; document_id: ID; summary: string };

export interface IDelegation {
  id: ID;
  unit_type: EDelegationUnit;
  unit_id: ID;
  workspace_slug: string;
  project_id: ID;
  provider: EAgentProvider;
  connection_id: ID;
  delegated_by: ID;
  status: EDelegationStatus;
  custom_prompt: string | null;
  result: IDelegationResult | null;
  error: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** One SSE frame on the status stream. */
export interface IDelegationEvent {
  status: EDelegationStatus;
  message: string;
  at: ISODateString;
}

export interface ICreateDelegationPayload {
  unit_type: EDelegationUnit;
  unit_id: ID;
  connection_id: ID;
  custom_prompt?: string;
}

/** "Accept & run" (GIN-342): launch the work item to a connected agent, applying
 * its stored Execution Profile. The backend refuses (409) a stale / no-profile /
 * missing-required run. */
export interface ILaunchStoryPayload {
  connection_id: ID;
}

export interface ILaunchStoryResponse {
  run_id: ID; // the telemetry run
  agent: string; // the profile's resolved target agent
  required: string[]; // required pinned skills (the completion gate reads these)
  delegation: IDelegation;
}
