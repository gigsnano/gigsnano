import type { EBlueprintLifecycle, IBlueprintValidationIssue } from "./blueprint";

/**
 * Blueprint authoring, validation and release workflow (GIN-454).
 *
 * Internal only — there is no public listing, no ratings and no monetization
 * in V1. A released version is immutable: editing one forks a new draft.
 */

/** Separated so authoring, review and publication are distinct privileges. */
export enum EBlueprintRole {
  Author = "author",
  Reviewer = "reviewer",
  Publisher = "publisher",
}

export interface IBlueprintActor {
  id: string;
  roles: EBlueprintRole[];
}

export enum EBlueprintAuditAction {
  DraftEdited = "draft_edited",
  Cloned = "cloned",
  Imported = "imported",
  Validated = "validated",
  ReturnedToDraft = "returned_to_draft",
  Approved = "approved",
  Published = "published",
  Deprecated = "deprecated",
  Revoked = "revoked",
}

export interface IBlueprintAuditEntry {
  id: string;
  blueprint_key: string;
  blueprint_version: number;
  action: EBlueprintAuditAction;
  actor_id: string;
  at: string;
  /** Digest of the definition at the time of the action. */
  digest: string;
  detail: string;
}

/** Compatibility of a definition against the platform it would install onto. */
export interface IBlueprintCompatibility {
  /** Connector keys the definition needs that the catalog does not provide. */
  missing_connectors: string[];
  /** connector_key → capability keys the connector cannot provide. */
  missing_capabilities: Record<string, string[]>;
  /** Skill profile refs that are not installed. */
  missing_skills: string[];
  /** Solution capabilities the definition needs but the solution lacks. */
  missing_solution_capabilities: string[];
  compatible: boolean;
}

export interface IBlueprintValidationReport {
  blueprint_key: string;
  blueprint_version: number;
  digest: string | null;
  /** Block release. */
  errors: IBlueprintValidationIssue[];
  /** Do not block release, but are shown on the release screen. */
  warnings: IBlueprintValidationIssue[];
  compatibility: IBlueprintCompatibility;
  /** True when the definition may move out of Draft. */
  releasable: boolean;
}

/** One installation of a blueprint, for the deprecate/revoke impact list. */
export interface IBlueprintInstallation {
  install_id: string;
  container_id: string;
  container_label: string;
  workspace_slug: string;
  blueprint_version: number;
  installed_at: string;
}

export interface IBlueprintImpact {
  blueprint_key: string;
  from_lifecycle: EBlueprintLifecycle;
  to_lifecycle: EBlueprintLifecycle;
  installations: IBlueprintInstallation[];
  /** Plain-language consequence for the operator confirming the change. */
  consequence: string;
}
