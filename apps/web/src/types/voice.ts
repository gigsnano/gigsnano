/**
 * Voice session contract, mirroring the backend's canonical events (GIN-501).
 *
 * Snake_case on the wire types because that is what the Python API sends; the
 * client state machine below is the only place that translates.
 */

export enum EVoicePhase {
  Idle = "idle",
  Connecting = "connecting",
  Listening = "listening",
  Processing = "processing",
  Speaking = "speaking",
  Paused = "paused",
  Reconnecting = "reconnecting",
  Error = "error",
}

export enum EVoiceEvent {
  SessionStarted = "session_started",
  TurnStarted = "turn_started",
  TranscriptPartial = "transcript_partial",
  TranscriptFinal = "transcript_final",
  TurnEnded = "turn_ended",
  SynthesisStarted = "synthesis_started",
  SynthesisChunk = "synthesis_chunk",
  SynthesisDone = "synthesis_done",
  Interrupted = "interrupted",
  Cancelled = "cancelled",
  Error = "error",
  SessionEnded = "session_ended",
}

export interface IVoiceEvent {
  version: number;
  seq: number;
  type: EVoiceEvent;
  session_id: string;
  correlation_id: string;
  text?: string;
  error_code?: string;
  retryable?: boolean;
}

export interface IVoiceCredential {
  session_id: string;
  token: string;
  expires_at: string;
  locale: string;
  agent_profile_version: number;
  epoch: number;
}

export enum EMicPermission {
  Unknown = "unknown",
  Prompt = "prompt",
  Granted = "granted",
  Denied = "denied",
  Unsupported = "unsupported",
}

/** Where a drafted field came from — mirrors the backend's ESource (GIN-512). */
export enum EFieldSource {
  Spoken = "spoken",
  Context = "context",
  Default = "default",
  Generated = "generated",
}

export interface IProposalField {
  name: string;
  label: string;
  value: string;
  source: EFieldSource;
}

export interface IMutationProposal {
  action: "create" | "update" | "comment";
  /** Confirmation is bound to this. A changed proposal has a changed hash. */
  hash: string;
  target_code?: string;
  target_url?: string;
  fields: IProposalField[];
  /** before -> after, for updates. */
  delta?: Record<string, [string, string]>;
}

export interface ICandidate {
  id: string;
  label: string;
  evidence?: string;
}

export interface IClarification {
  field: string;
  question: string;
  candidates: ICandidate[];
}

export interface IResultItem {
  id: string;
  code: string;
  title: string;
  status: string;
  url: string;
}

export interface IReadResult {
  items: IResultItem[];
  total: number;
  truncated: boolean;
  filters: string;
  available: boolean;
}

export interface IReceipt {
  outcome: "applied" | "deduplicated" | "failed";
  action: string;
  result_code?: string;
  result_url?: string;
  correlation_id: string;
  detail?: string;
  /** A failure that left a draft the user can pick back up. */
  recoverable_draft?: boolean;
}
