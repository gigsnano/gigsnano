import type { EConnectionStatus } from "./connection";

/**
 * Connection operations: health, reauthorization, uninstall and audit
 * (GIN-460).
 *
 * Health output is a *classification*, never provider detail — an error
 * category and a hint, so a failure can be acted on without leaking secrets or
 * the names of resources the workspace cannot see.
 */

export enum EHealthState {
  Healthy = "healthy",
  /** Working, but something needs attention (expiring subscription, partial). */
  Degraded = "degraded",
  /** Not usable until the listed action is taken. */
  Failing = "failing",
  /** Never checked, or the connection is not in a checkable status. */
  Unknown = "unknown",
}

/** Coarse failure classes. Deliberately provider-agnostic. */
export enum EHealthErrorCategory {
  None = "none",
  AuthExpired = "auth_expired",
  PermissionRevoked = "permission_revoked",
  ScopeInsufficient = "scope_insufficient",
  RateLimited = "rate_limited",
  ProviderUnavailable = "provider_unavailable",
  ConfigurationInvalid = "configuration_invalid",
  Unknown = "unknown",
}

export interface IConnectionHealth {
  connection_id: string;
  state: EHealthState;
  category: EHealthErrorCategory;
  /** Safe, user-facing explanation. Never contains provider payloads. */
  summary: string;
  /** What to do about it; null when nothing is needed. */
  action: string | null;
  last_success_at: string | null;
  last_checked_at: string | null;
  /** Consecutive failures — drives operator alerting. */
  consecutive_failures: number;
  /** Backoff target; null when no retry is scheduled. */
  next_retry_at: string | null;
  /** True when the user must re-authorize before the connection works again. */
  requires_reauthorization: boolean;
}

/** A provider webhook/subscription that has to be renewed before it lapses. */
export interface ISubscriptionRenewal {
  id: string;
  connection_id: string;
  /** Logical resource label — safe to show; no provider ids. */
  label: string;
  expires_at: string;
  last_renewed_at: string | null;
  auto_renew: boolean;
}

export enum EDependentKind {
  Blueprint = "blueprint",
  Journey = "journey",
  Agent = "agent",
  Ingestion = "ingestion",
  Container = "container",
}

export interface IConnectionDependent {
  kind: EDependentKind;
  key: string;
  label: string;
  /** Capability keys this dependent actually consumes. */
  capabilities: string[];
  /** The dependent stops working entirely without this connection. */
  critical: boolean;
}

/** Everything that breaks if a connection goes away. */
export interface IConnectionDependencyGraph {
  connection_id: string;
  dependents: IConnectionDependent[];
  critical_count: number;
}

export enum EUninstallStepStatus {
  Pending = "pending",
  Running = "running",
  Done = "done",
  Failed = "failed",
  /** Provider cleanup could not be automated — a human must finish it. */
  ManualRecoveryRequired = "manual_recovery_required",
}

export interface IUninstallStep {
  key: string;
  label: string;
  status: EUninstallStepStatus;
  detail: string | null;
}

/** Shown before uninstall — no writes happen to produce it. */
export interface IUninstallPreview {
  connection_id: string;
  /** Agent/journey actions that stop immediately. */
  actions_stopped: string[];
  /** Provider subscriptions that will be removed. */
  subscriptions_removed: string[];
  /** Dependents that lose retrieval and degrade. */
  retrieval_disabled: string[];
  /** Plain-language retention/deletion consequence. */
  retention_consequence: string;
  /** True when uninstall would break something critical. */
  blocks_critical_work: boolean;
}

export interface IUninstallJob {
  connection_id: string;
  steps: IUninstallStep[];
  /** Only true when every step is done — never while cleanup is pending. */
  complete: boolean;
  requires_manual_recovery: boolean;
  started_at: string;
  finished_at: string | null;
}

export enum EConnectionAuditAction {
  Requested = "requested",
  ApprovalRequested = "approval_requested",
  Approved = "approved",
  Rejected = "rejected",
  Authorized = "authorized",
  CapabilityUsed = "capability_used",
  HealthFailed = "health_failed",
  Reauthorized = "reauthorized",
  PermissionIncreased = "permission_increased",
  SubscriptionRenewed = "subscription_renewed",
  Revoked = "revoked",
  Deleted = "deleted",
}

export interface IConnectionAuditEntry {
  id: string;
  connection_id: string;
  action: EConnectionAuditAction;
  at: string;
  /** Who caused it — user id, or `system` for scheduled work. */
  actor_id: string;
  /** Approver when the action needed one. */
  approver_id: string | null;
  capability_key: string | null;
  /** Provider scopes involved — labels only. */
  scopes: string[];
  /** Safe summary. Must not carry provider payloads or secrets. */
  detail: string;
}

/** Operator-facing rollup for the connection health dashboard. */
export interface IHealthAlert {
  connection_id: string;
  connector_key: string;
  code: "repeated_failures" | "subscription_expiring" | "reauthorization_required";
  message: string;
  since: string;
}

/** Degraded-state payload the journey/agent UI renders inline. */
export interface IDegradedNotice {
  connection_id: string;
  connector_key: string;
  status: EConnectionStatus;
  summary: string;
  action: string | null;
  /** Whether the user can fix it themselves or needs an admin. */
  requires_admin: boolean;
}
