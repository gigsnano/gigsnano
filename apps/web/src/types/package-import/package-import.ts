/** External document-package import (GIN-393). Mirrors the Python API shapes. */

/** How a document was classified. Matches `lib/document_classify.DOC_TYPES`. */
export enum EPackageDocType {
  ProductRequirements = "product_requirements",
  Architecture = "architecture",
  UiUx = "ui_ux",
  DesignSystem = "design_system",
  ImplementationPlan = "implementation_plan",
  TestPlan = "test_plan",
  Security = "security",
  Deployment = "deployment",
  ApiSpec = "api_spec",
  DataModel = "data_model",
  Schedule = "schedule",
  Unknown = "unknown",
}

/** Why a document is or is not usable. `ok` is the only readable state. */
export enum EParseState {
  Ok = "ok",
  Unsupported = "unsupported",
  TooLarge = "too_large",
  Encrypted = "encrypted",
  Empty = "empty",
  Duplicate = "duplicate",
}

/** How much the package commits to a finding. */
export enum EFindingStatus {
  Approved = "approved",
  Proposed = "proposed",
  Assumption = "assumption",
  Blocked = "blocked",
  Missing = "missing",
  Conflict = "conflict",
}

export interface IPackageDocument {
  id: string;
  title: string;
  /** Classification, correctable by the user (the AI's verdict is kept server-side). */
  doc_type?: EPackageDocType;
  file_name: string | null;
  mime_type: string | null;
  original_path: string | null;
  parse_state: EParseState | null;
  parse_error: string | null;
  byte_size: number | null;
  checksum: string | null;
  canonical: boolean;
}

export interface IPackageCounts {
  total: number;
  ready: number;
  needs_attention: number;
}

export interface IDocumentPackage {
  id: string;
  project_id: string;
  name: string;
  status: string;
  correlation_id: string;
  counts: IPackageCounts;
  documents: IPackageDocument[];
}

export interface IPackageFinding {
  id: string;
  document_id: string | null;
  kind: string;
  status: EFindingStatus;
  title: string;
  detail: string;
  confidence: number;
  anchor: string;
  anchor_start: number | null;
  anchor_end: number | null;
  source_excerpt: string;
  /** A user decision recorded beside the AI's original, never replacing it. */
  override: { status?: EFindingStatus; title?: string; detail?: string } | null;
}

export interface IPackageAnalysis {
  package_id: string;
  status: string;
  counts_by_status: Record<string, number>;
  counts_by_kind: Record<string, number>;
  findings: IPackageFinding[];
}

export interface IUploadPackageFile {
  file_name: string;
  mime_type: string;
  /** Text, or a base64 `data:` URL for binary. */
  content: string;
}

export interface IUploadPackagePayload {
  name: string;
  files: IUploadPackageFile[];
}

export interface IUpdatePackageDocumentPayload {
  doc_type?: EPackageDocType;
  canonical?: boolean;
}

export interface IUpdateFindingPayload {
  status?: EFindingStatus;
  title?: string;
  detail?: string;
}

/** How the supplied plan maps onto GigsNano structure. */
export enum EImportStrategy {
  Preserve = "preserve",
  Convert = "convert",
  Hybrid = "hybrid",
}

export enum EImportChangeStatus {
  Proposed = "proposed",
  Approved = "approved",
  Excluded = "excluded",
  NeedsReview = "needs_review",
  Applied = "applied",
  Failed = "failed",
  RolledBack = "rolled_back",
}

export interface IImportChange {
  id: string;
  op: string;
  target: string;
  status: EImportChangeStatus;
  temp_key: string;
  parent_temp_key: string | null;
  title: string;
  payload: Record<string, unknown> | null;
  finding_id: string | null;
  reason: string;
  confidence: number;
}

export interface IImportConflict {
  finding_id: string;
  title: string;
  anchor: string;
  resolution: string;
}

export interface IImportPlan {
  id: string;
  package_id: string;
  strategy: EImportStrategy;
  status: string;
  correlation_id: string;
  counts_by_target: Record<string, number>;
  counts_by_status: Record<string, number>;
  blocking_conflicts: IImportConflict[];
  can_apply: boolean;
  changes: IImportChange[];
}

export interface IApplyResult {
  plan_id: string;
  status: string;
  applied: number;
  failed: number;
  skipped: number;
  by_target: Record<string, Record<string, number>>;
}

export interface IRollbackResult {
  plan_id: string;
  status: string;
  removed: number;
}
