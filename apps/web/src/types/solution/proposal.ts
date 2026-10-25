import type { ESolutionKey } from "./solution";

/**
 * Structure proposals (GIN-449).
 *
 * One versioned proposal contract shared by every solution; the *nodes* carry
 * solution-specific fields. Approval freezes a version — later edits fork a new
 * version and produce an impact notice rather than mutating approved history.
 *
 * Software Delivery nodes describe layers/components and hand off to the
 * existing topology model (GIN-408/GIN-427); this contract never becomes a
 * competing topology of its own.
 */

export enum EProposalStatus {
  /** Machine output, untouched. */
  Inferred = "inferred",
  /** User has edited at least one node. */
  Edited = "edited",
  /** Frozen. Further changes create a new version. */
  Approved = "approved",
  /** Replaced by a newer version. */
  Superseded = "superseded",
}

export enum EProposalNodeKind {
  /** Software Delivery: a layer or component. */
  Component = "component",
  /** Revenue Assurance: a business scope / source-map entry. */
  Source = "source",
}

export enum EProposalOrigin {
  /** Produced by analysis (GIN-448) — carries provenance. */
  Inferred = "inferred",
  /** Typed by the user. */
  Manual = "manual",
}

/** Where an inferred node came from, so every field links to its source. */
export interface IProposalProvenance {
  source_ref: string;
  source_label: string;
  source_version: string;
}

/**
 * One node in a proposal. `attributes` is the solution-specific payload —
 * responsibility/stack/deployment_unit for Software Delivery, identifiers/
 * coverage_period for Revenue Assurance.
 */
export interface IProposalNode {
  /** Stable logical key — survives edits and version forks. */
  key: string;
  kind: EProposalNodeKind;
  label: string;
  origin: EProposalOrigin;
  confidence: number | null;
  provenance: IProposalProvenance | null;
  /** Keys of other nodes this one depends on. Cycles fail validation. */
  depends_on: string[];
  /** Responsible person/team id. Required nodes without one are actionable. */
  owner_id: string | null;
  attributes: Record<string, unknown>;
}

/** A field the schema requires but the proposal is missing. */
export interface IProposalGap {
  node_key: string | null;
  field: string;
  message: string;
  /** True when a waiver may clear it; false means it must be filled. */
  waivable: boolean;
}

export interface IProposalWaiver {
  node_key: string | null;
  field: string;
  rationale: string;
  waived_by: string;
  waived_at: string;
}

export interface IStructureProposal {
  id: string;
  workspace_slug: string;
  setup_draft_id: string;
  solution_key: ESolutionKey;
  /** Monotonic per setup draft. Approval freezes the current number. */
  version: number;
  status: EProposalStatus;
  nodes: IProposalNode[];
  waivers: IProposalWaiver[];
  approved_by: string | null;
  approved_at: string | null;
  /** Version this one forked from, when an approved proposal was edited. */
  parent_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface IProposalValidationIssue {
  node_key: string | null;
  code: string;
  message: string;
}

export interface IProposalValidationResult {
  ok: boolean;
  issues: IProposalValidationIssue[];
  gaps: IProposalGap[];
}

/** Diff between two versions — drives the "what changed" review. */
export interface IProposalDiff {
  from_version: number;
  to_version: number;
  added: string[];
  removed: string[];
  /** Node key → changed attribute/field names. */
  changed: Record<string, string[]>;
}

/** Shown when an approved proposal is edited. */
export interface IProposalImpactNotice {
  from_version: number;
  to_version: number;
  message: string;
  /** Downstream artifacts that were derived from the approved version. */
  affected: string[];
}
