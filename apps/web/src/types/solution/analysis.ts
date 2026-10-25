/**
 * Context import + asynchronous analysis (GIN-448).
 *
 * Jobs outlive the wizard session — navigating away does not cancel them.
 * Inferred fields always carry provenance; approved values are never silently
 * overwritten when a source updates (they become stale instead).
 */

export enum EAnalysisSourceKind {
  Repository = "repository",
  Upload = "upload",
  Artifact = "artifact",
  Connector = "connector",
}

export enum EAnalysisJobStatus {
  Queued = "queued",
  Running = "running",
  Partial = "partial",
  NeedsInput = "needs_input",
  Failed = "failed",
  Completed = "completed",
  Cancelled = "cancelled",
}

export enum EAnalysisSubStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Skipped = "skipped",
}

export enum EInferenceDecision {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Stale = "stale",
}

export interface IAnalysisSourceRef {
  kind: EAnalysisSourceKind;
  /** Stable id within the kind (repo full name, upload id, artifact id, …). */
  ref: string;
  /** Content/version fingerprint — changing it marks dependent inferences stale. */
  version: string;
  label: string;
}

export interface IAnalysisSubResult {
  key: string;
  label: string;
  status: EAnalysisSubStatus;
  /** Artifact id produced; reused on retry so we do not duplicate. */
  artifact_id: string | null;
  error: string | null;
}

export interface IInferredField {
  field_key: string;
  value: unknown;
  confidence: number;
  source: IAnalysisSourceRef;
  decision: EInferenceDecision;
  /** Who approved/rejected; null while pending/stale. */
  decided_by: string | null;
  decided_at: string | null;
}

export interface IAnalysisProgressEvent {
  at: string;
  message: string;
  ratio: number;
}

export interface IAnalysisJob {
  id: string;
  workspace_slug: string;
  setup_draft_id: string;
  status: EAnalysisJobStatus;
  sources: IAnalysisSourceRef[];
  sub_results: IAnalysisSubResult[];
  inferences: IInferredField[];
  progress: IAnalysisProgressEvent[];
  /** Ratio 0–1 derived from sub_results; partial jobs stay < 1. */
  ratio: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  /** True when temporary upload files were cleaned after cancel/complete. */
  temp_files_cleaned: boolean;
}

export interface IStartAnalysisPayload {
  setup_draft_id: string;
  sources: IAnalysisSourceRef[];
}

export interface IApproveInferencePayload {
  decision: EInferenceDecision.Approved | EInferenceDecision.Rejected;
}

/** Upload gate before any processing (GIN-448). */
export interface IUploadValidationResult {
  ok: boolean;
  errors: string[];
}

export const ANALYSIS_UPLOAD_LIMITS = {
  max_bytes: 25 * 1024 * 1024,
  allowed_mime: [
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/json",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
} as const;
