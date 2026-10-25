import type { ESolutionKey } from "./solution";

/**
 * Versioned blueprint specification (GIN-451).
 *
 * One declarative contract for built-in and workspace-private blueprints.
 * Credentials, OAuth tokens and customer source data must never appear in a
 * definition — only logical keys, parameters and references.
 */

export enum EBlueprintLifecycle {
  Draft = "draft",
  Validated = "validated",
  Approved = "approved",
  Deprecated = "deprecated",
  Revoked = "revoked",
}

export enum EBlueprintVisibility {
  BuiltIn = "built_in",
  WorkspacePrivate = "workspace_private",
}

/** Stable identity for a blueprint across versions. */
export interface IBlueprintIdentity {
  /** Immutable logical key (e.g. `sd.greenfield.default`). */
  key: string;
  /** Semver-ish integer version — bump on any material change. */
  version: number;
  name: string;
  description: string;
  solution_key: ESolutionKey;
  /** Minimum solution definition version this blueprint requires. */
  solution_version_min: number;
}

export interface IBlueprintParameter {
  key: string;
  label: string;
  required: boolean;
  /** JSON-schema-ish type hint for the installer. */
  value_type: "string" | "boolean" | "number" | "string_list";
  default: unknown;
}

export interface IBlueprintWorkNode {
  /** Stable logical key for the materialized work item / epic. */
  key: string;
  label: string;
  /** Other work-node keys this one depends on. Cycles fail validation. */
  depends_on: string[];
}

export interface IBlueprintDomain {
  key: string;
  label: string;
  /** Route segment under the container when installed. */
  segment: string;
}

export interface IBlueprintView {
  key: string;
  label: string;
  kind: "board" | "list" | "timeline" | "dashboard";
}

export interface IBlueprintDocument {
  key: string;
  title: string;
  template_ref: string | null;
}

export interface IBlueprintMilestone {
  key: string;
  label: string;
  order: number;
}

export interface IBlueprintIntegrationRef {
  /** Connector manifest key (GIN-455). */
  connector_key: string;
  /** Capability keys required from that connector. */
  capabilities: string[];
}

export interface IBlueprintAgentRole {
  key: string;
  label: string;
  skill_profile_ref: string | null;
}

export interface IBlueprintApproval {
  key: string;
  label: string;
  required: boolean;
}

export interface IBlueprintDashboard {
  key: string;
  label: string;
}

export interface IBlueprintSuccessMeasure {
  key: string;
  label: string;
  metric: string;
}

export interface IBlueprintMigrationPolicy {
  /** Whether installs of older versions may auto-upgrade. */
  allow_auto_upgrade: boolean;
  /** Semver range of versions this definition can migrate from. */
  from_versions: number[];
  notes: string;
}

/**
 * Full blueprint definition. Canonical serialization (see
 * `lib/solutions/blueprint/digest.ts`) must be stable so the same definition
 * always yields the same digest.
 */
export interface IBlueprintDefinition {
  identity: IBlueprintIdentity;
  lifecycle: EBlueprintLifecycle;
  visibility: EBlueprintVisibility;
  /** Intake journey key this blueprint expects (e.g. `idea`). */
  journey_ref: string | null;
  parameters: IBlueprintParameter[];
  domains: IBlueprintDomain[];
  views: IBlueprintView[];
  documents: IBlueprintDocument[];
  milestones: IBlueprintMilestone[];
  work_graph: IBlueprintWorkNode[];
  integrations: IBlueprintIntegrationRef[];
  agent_roles: IBlueprintAgentRole[];
  approvals: IBlueprintApproval[];
  dashboards: IBlueprintDashboard[];
  success_measures: IBlueprintSuccessMeasure[];
  migration: IBlueprintMigrationPolicy;
  /**
   * Forbidden: any key matching credential patterns. Validation rejects
   * definitions that smuggle secrets under parameters or free-form maps.
   */
}

/** Auditable install record — retains version/digest after revoke. */
export interface IBlueprintInstall {
  id: string;
  blueprint_key: string;
  blueprint_version: number;
  digest: string;
  container_id: string;
  installed_at: string;
  /** Lifecycle of the definition *at install time* — not live. */
  installed_lifecycle: EBlueprintLifecycle;
}

export interface IBlueprintValidationIssue {
  path: string;
  code: string;
  message: string;
}

export interface IBlueprintValidationResult {
  ok: boolean;
  digest: string | null;
  issues: IBlueprintValidationIssue[];
}
