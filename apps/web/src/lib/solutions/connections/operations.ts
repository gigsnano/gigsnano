import {
  EConnectionStatus,
  type IConnection,
} from "@/types/solution/connection";
import {
  EConnectionAuditAction,
  EDependentKind,
  EHealthErrorCategory,
  EHealthState,
  EUninstallStepStatus,
  type IConnectionAuditEntry,
  type IConnectionDependencyGraph,
  type IConnectionDependent,
  type IConnectionHealth,
  type IDegradedNotice,
  type IHealthAlert,
  type ISubscriptionRenewal,
  type IUninstallJob,
  type IUninstallPreview,
} from "@/types/solution/connection-ops";

/**
 * Connection health, reauthorization, uninstall and audit (GIN-460).
 *
 * Pure functions: a raw provider failure goes in, a safe classification comes
 * out. Nothing here ever returns provider payloads, resource names the caller
 * cannot already see, or credential material.
 */

/** Exponential backoff, capped so a broken connection still retries hourly. */
const BASE_RETRY_MS = 60_000;
const MAX_RETRY_MS = 3_600_000;
/** Consecutive failures before the operator dashboard raises an alert. */
export const REPEATED_FAILURE_THRESHOLD = 3;
/** Renewal lead time — a subscription inside this window is "expiring". */
export const SUBSCRIPTION_WARNING_MS = 72 * 3_600_000;

const CATEGORY_COPY: Record<
  EHealthErrorCategory,
  { summary: string; action: string | null; reauth: boolean }
> = {
  [EHealthErrorCategory.None]: {
    summary: "Working normally.",
    action: null,
    reauth: false,
  },
  [EHealthErrorCategory.AuthExpired]: {
    summary: "The authorization for this integration has expired.",
    action: "Reconnect the integration to refresh access.",
    reauth: true,
  },
  [EHealthErrorCategory.PermissionRevoked]: {
    summary: "Access was withdrawn on the provider side.",
    action: "Reconnect and grant access again.",
    reauth: true,
  },
  [EHealthErrorCategory.ScopeInsufficient]: {
    summary: "The integration no longer has every permission it needs.",
    action: "Reauthorize to grant the missing permissions.",
    reauth: true,
  },
  [EHealthErrorCategory.RateLimited]: {
    summary: "The provider is rate-limiting requests.",
    action: "No action needed — this retries automatically.",
    reauth: false,
  },
  [EHealthErrorCategory.ProviderUnavailable]: {
    summary: "The provider is unreachable right now.",
    action: "No action needed — this retries automatically.",
    reauth: false,
  },
  [EHealthErrorCategory.ConfigurationInvalid]: {
    summary: "This integration is configured in a way the provider rejects.",
    action: "Review the integration settings with an admin.",
    reauth: false,
  },
  [EHealthErrorCategory.Unknown]: {
    summary: "The last check failed for an unrecognized reason.",
    action: "Try again; contact support if it keeps failing.",
    reauth: false,
  },
};

/** Categories that mean "keep retrying" rather than "a human must act". */
const TRANSIENT: ReadonlySet<EHealthErrorCategory> = new Set([
  EHealthErrorCategory.RateLimited,
  EHealthErrorCategory.ProviderUnavailable,
]);

export function nextRetryAt(consecutiveFailures: number, from: Date = new Date()): string {
  const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, consecutiveFailures - 1));
  return new Date(from.getTime() + delay).toISOString();
}

export interface IHealthCheckInput {
  connection: IConnection;
  /** Outcome of the probe. `None` means it succeeded. */
  category: EHealthErrorCategory;
  checked_at: string;
  last_success_at: string | null;
  /** Failures before this check. Reset to 0 on success. */
  previous_failures: number;
}

/**
 * Classify a probe result. The caller passes an already-categorized outcome so
 * no provider error text can reach this layer — and therefore the UI.
 */
export function evaluateHealth(input: IHealthCheckInput): IConnectionHealth {
  const { connection, category, checked_at } = input;

  if (
    connection.status === EConnectionStatus.Revoked ||
    connection.status === EConnectionStatus.Deleting ||
    connection.status === EConnectionStatus.Deleted
  ) {
    return {
      connection_id: connection.id,
      state: EHealthState.Unknown,
      category: EHealthErrorCategory.None,
      summary: "This integration is no longer active.",
      action: null,
      last_success_at: input.last_success_at,
      last_checked_at: checked_at,
      consecutive_failures: 0,
      next_retry_at: null,
      requires_reauthorization: false,
    };
  }

  const copy = CATEGORY_COPY[category];

  if (category === EHealthErrorCategory.None) {
    return {
      connection_id: connection.id,
      state: EHealthState.Healthy,
      category,
      summary: copy.summary,
      action: null,
      last_success_at: checked_at,
      last_checked_at: checked_at,
      consecutive_failures: 0,
      next_retry_at: null,
      requires_reauthorization: false,
    };
  }

  const failures = input.previous_failures + 1;

  return {
    connection_id: connection.id,
    state: TRANSIENT.has(category) ? EHealthState.Degraded : EHealthState.Failing,
    category,
    summary: copy.summary,
    action: copy.action,
    last_success_at: input.last_success_at,
    last_checked_at: checked_at,
    consecutive_failures: failures,
    next_retry_at: nextRetryAt(failures, new Date(checked_at)),
    requires_reauthorization: copy.reauth,
  };
}

/** Subscriptions inside the warning window, oldest expiry first. */
export function expiringSubscriptions(
  subscriptions: ISubscriptionRenewal[],
  now: Date = new Date(),
): ISubscriptionRenewal[] {
  return subscriptions
    .filter((sub) => new Date(sub.expires_at).getTime() - now.getTime() <= SUBSCRIPTION_WARNING_MS)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
}

/** Operator rollup: repeated failures, expiring subscriptions, reauth needed. */
export function healthAlerts(
  connections: IConnection[],
  health: IConnectionHealth[],
  subscriptions: ISubscriptionRenewal[],
  now: Date = new Date(),
): IHealthAlert[] {
  const byId = new Map(connections.map((c) => [c.id, c]));
  const alerts: IHealthAlert[] = [];

  for (const entry of health) {
    const connection = byId.get(entry.connection_id);
    if (!connection) continue;

    if (entry.consecutive_failures >= REPEATED_FAILURE_THRESHOLD) {
      alerts.push({
        connection_id: entry.connection_id,
        connector_key: connection.connector_key,
        code: "repeated_failures",
        message: `${entry.consecutive_failures} checks in a row have failed.`,
        since: entry.last_success_at ?? entry.last_checked_at ?? now.toISOString(),
      });
    }
    if (entry.requires_reauthorization) {
      alerts.push({
        connection_id: entry.connection_id,
        connector_key: connection.connector_key,
        code: "reauthorization_required",
        message: entry.summary,
        since: entry.last_checked_at ?? now.toISOString(),
      });
    }
  }

  for (const sub of expiringSubscriptions(subscriptions, now)) {
    const connection = byId.get(sub.connection_id);
    if (!connection) continue;
    alerts.push({
      connection_id: sub.connection_id,
      connector_key: connection.connector_key,
      code: "subscription_expiring",
      message: `"${sub.label}" stops delivering updates on ${sub.expires_at.slice(0, 10)}.`,
      since: sub.last_renewed_at ?? now.toISOString(),
    });
  }

  return alerts;
}

/** What the journey/agent UI shows inline when a connection is not healthy. */
export function degradedNotice(
  connection: IConnection,
  health: IConnectionHealth,
): IDegradedNotice | null {
  if (health.state === EHealthState.Healthy) return null;
  if (connection.status === EConnectionStatus.Deleted) return null;

  return {
    connection_id: connection.id,
    connector_key: connection.connector_key,
    status: connection.status,
    summary: health.summary,
    action: health.action,
    requires_admin: health.category === EHealthErrorCategory.ConfigurationInvalid,
  };
}

export function buildDependencyGraph(
  connectionId: string,
  dependents: IConnectionDependent[],
): IConnectionDependencyGraph {
  return {
    connection_id: connectionId,
    dependents,
    critical_count: dependents.filter((d) => d.critical).length,
  };
}

const RETENTION_COPY: Record<string, string> = {
  purge: "Data retrieved through this integration is deleted within 24 hours.",
  retain: "Data already retrieved stays in this workspace; only new retrieval stops.",
};

export function previewUninstall(
  graph: IConnectionDependencyGraph,
  subscriptions: ISubscriptionRenewal[],
  retention: "purge" | "retain",
): IUninstallPreview {
  const actions_stopped = graph.dependents
    .filter((d) => d.kind === EDependentKind.Agent || d.kind === EDependentKind.Journey)
    .map((d) => d.label);

  const retrieval_disabled = graph.dependents
    .filter((d) => d.kind === EDependentKind.Ingestion || d.kind === EDependentKind.Blueprint)
    .map((d) => d.label);

  return {
    connection_id: graph.connection_id,
    actions_stopped,
    subscriptions_removed: subscriptions
      .filter((s) => s.connection_id === graph.connection_id)
      .map((s) => s.label),
    retrieval_disabled,
    retention_consequence: RETENTION_COPY[retention],
    blocks_critical_work: graph.critical_count > 0,
  };
}

/** Uninstall is only complete when every step finished — never optimistically. */
export function summarizeUninstall(job: IUninstallJob): IUninstallJob {
  const requires_manual_recovery = job.steps.some(
    (s) => s.status === EUninstallStepStatus.ManualRecoveryRequired,
  );
  const complete =
    !requires_manual_recovery &&
    job.steps.length > 0 &&
    job.steps.every((s) => s.status === EUninstallStepStatus.Done);

  return {
    ...job,
    complete,
    requires_manual_recovery,
    finished_at: complete ? (job.finished_at ?? new Date().toISOString()) : null,
  };
}

/**
 * A revoked connection must be unusable even from an agent session that cached
 * it. Callers check this at *use* time, not only at session start.
 */
export function isUsableFromCachedSession(
  connection: IConnection,
  cachedAt: string,
): boolean {
  if (connection.status !== EConnectionStatus.Connected) return false;
  if (connection.revoked_at) return false;
  return new Date(connection.updated_at).getTime() <= new Date(cachedAt).getTime();
}

let auditSeq = 0;

function auditEntry(
  connectionId: string,
  action: EConnectionAuditAction,
  actorId: string,
  detail: string,
  extra: Partial<IConnectionAuditEntry> = {},
): IConnectionAuditEntry {
  auditSeq += 1;
  return {
    id: `audit-${auditSeq}`,
    connection_id: connectionId,
    action,
    at: new Date().toISOString(),
    actor_id: actorId,
    approver_id: null,
    capability_key: null,
    scopes: [],
    detail,
    ...extra,
  };
}

/**
 * Record a permission increase. Always emits an approval-request event
 * alongside it — a scope increase can never be applied silently.
 */
export function recordPermissionIncrease(
  connection: IConnection,
  addedCapabilities: string[],
  addedScopes: string[],
  actorId: string,
): IConnectionAuditEntry[] {
  if (addedCapabilities.length === 0 && addedScopes.length === 0) return [];

  return [
    auditEntry(
      connection.id,
      EConnectionAuditAction.PermissionIncreased,
      actorId,
      `Requested additional access: ${[...addedCapabilities, ...addedScopes].join(", ")}.`,
      { scopes: addedScopes },
    ),
    auditEntry(
      connection.id,
      EConnectionAuditAction.ApprovalRequested,
      actorId,
      "An admin must approve the additional access before it takes effect.",
      { scopes: addedScopes },
    ),
  ];
}

/** Chronological timeline for the audit view. */
export function auditTimeline(entries: IConnectionAuditEntry[]): IConnectionAuditEntry[] {
  return [...entries].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
