import type { ID } from "@/types/common";

/** A prior locked Foundation version, snapshotted on re-lock (GIN-196). */
export interface IFoundationVersion {
  version: number;
  preset_key: string;
  allowed_libraries: string[];
  enforce_design_tokens: boolean;
  quality_gates: string[];
  database: string;
  architecture: string;
}

/** A proposed change awaiting review (GIN-196). */
export interface IPendingChange {
  proposed_by: string;
  proposed_at: string;
  payload: ILockFoundationPayload;
}

/** Mirrors the API `FoundationOut`. */
export interface IFoundation {
  project_id: ID;
  preset_key: string;
  allowed_libraries: string[];
  enforce_design_tokens: boolean;
  quality_gates: string[];
  database: string;
  architecture: string;
  pinned_artifacts: string[];
  status: string; // "locked" | "draft"
  version: number;
  history: IFoundationVersion[];
  pending_change: IPendingChange | null;
}

/** Mirrors the API `ArtifactOut` — a loadable skill / design-system / persona. */
export interface IArtifact {
  id: string;
  artifact_type: "skill" | "design_system" | "persona";
  name: string;
  version: string;
  visibility: "private" | "public";
  payload: string;
}

/** Mirrors the API `ViolationOut`. */
export interface IViolation {
  rule: string;
  file: string;
  line: number;
  blocking: boolean;
  detail: string;
}

/** Mirrors the API `ValidationResultOut`. */
export interface IValidationResult {
  status: "pass" | "fail";
  violations: IViolation[];
}

export interface ILockFoundationPayload {
  preset_key?: string;
  allowed_libraries?: string[];
  enforce_design_tokens?: boolean;
  quality_gates?: string[];
  database?: string;
  architecture?: string;
}

export interface IValidateDiffPayload {
  diff: string;
  gate_results?: Record<string, boolean>;
}

/** Mirrors the API `StackDetectionOut` — preset suggested from the cloned repo. */
export interface IStackDetection {
  suggested_preset: string | null;
}
