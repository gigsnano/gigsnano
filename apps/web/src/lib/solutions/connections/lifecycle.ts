import {
  EConnectionStatus,
  type IConnection,
  type IConnectionRequest,
} from "@/types/solution/connection";

/**
 * Connection lifecycle transitions (GIN-456).
 *
 * Credentials never enter this module — only status + opaque auth_ref.
 */

const ACTIVE_FOR_TOOLS: ReadonlySet<EConnectionStatus> = new Set([
  EConnectionStatus.Connected,
]);

const ALLOWED: Record<EConnectionStatus, readonly EConnectionStatus[]> = {
  [EConnectionStatus.Requested]: [
    EConnectionStatus.AwaitingAdmin,
    EConnectionStatus.Authorizing,
    EConnectionStatus.Revoked,
  ],
  [EConnectionStatus.AwaitingAdmin]: [
    EConnectionStatus.Authorizing,
    EConnectionStatus.Revoked,
  ],
  [EConnectionStatus.Authorizing]: [
    EConnectionStatus.Connected,
    EConnectionStatus.Revoked,
  ],
  [EConnectionStatus.Connected]: [
    EConnectionStatus.Degraded,
    EConnectionStatus.Expired,
    EConnectionStatus.Revoked,
    EConnectionStatus.Deleting,
  ],
  [EConnectionStatus.Degraded]: [
    EConnectionStatus.Connected,
    EConnectionStatus.Expired,
    EConnectionStatus.Revoked,
    EConnectionStatus.Deleting,
  ],
  [EConnectionStatus.Expired]: [
    EConnectionStatus.Authorizing,
    EConnectionStatus.Revoked,
    EConnectionStatus.Deleting,
  ],
  [EConnectionStatus.Revoked]: [EConnectionStatus.Deleting],
  [EConnectionStatus.Deleting]: [EConnectionStatus.Deleted],
  [EConnectionStatus.Deleted]: [],
};

/** Dependent actions may run only while connected (not degraded/expired). */
export function canUseConnection(connection: IConnection): boolean {
  return ACTIVE_FOR_TOOLS.has(connection.status) && Boolean(connection.auth_ref);
}

export function recoveryInstructions(connection: IConnection): string | null {
  switch (connection.status) {
    case EConnectionStatus.Degraded:
      return (
        connection.recovery_hint ??
        "This connection is degraded. Reconnect or check the provider status, then retry."
      );
    case EConnectionStatus.Expired:
      return (
        connection.recovery_hint ??
        "Authorization expired. Reauthorize the integration to continue."
      );
    case EConnectionStatus.Revoked:
      return "This connection was revoked. Authorize a new connection to restore access.";
    case EConnectionStatus.AwaitingAdmin:
      return "Waiting for an admin to approve this integration.";
    case EConnectionStatus.Authorizing:
      return "Authorization is in progress. Finish the provider consent screen.";
    case EConnectionStatus.Deleting:
      return "This connection is being removed. Wait for cleanup to finish.";
    case EConnectionStatus.Deleted:
      return "This connection has been deleted.";
    default:
      return connection.recovery_hint;
  }
}

export function assertTransition(from: EConnectionStatus, to: EConnectionStatus): void {
  if (!(ALLOWED[from] ?? []).includes(to)) {
    throw new Error(`Invalid connection transition ${from} → ${to}.`);
  }
}

export function applyStatus(
  connection: IConnection,
  next: EConnectionStatus,
  extras: Partial<IConnection> = {},
): IConnection {
  assertTransition(connection.status, next);
  const now = new Date().toISOString();
  return {
    ...connection,
    ...extras,
    status: next,
    updated_at: now,
    connected_at:
      next === EConnectionStatus.Connected
        ? (extras.connected_at ?? now)
        : connection.connected_at,
    revoked_at:
      next === EConnectionStatus.Revoked ? (extras.revoked_at ?? now) : connection.revoked_at,
    deleted_at:
      next === EConnectionStatus.Deleted ? (extras.deleted_at ?? now) : connection.deleted_at,
  };
}

/** Immediate runtime denial on revoke — clears auth_ref so tools cannot use it. */
export function revokeConnection(connection: IConnection): IConnection {
  if (
    connection.status === EConnectionStatus.Deleted ||
    connection.status === EConnectionStatus.Deleting
  ) {
    throw new Error("Connection is already being removed.");
  }
  if (connection.status === EConnectionStatus.Revoked) {
    return { ...connection, auth_ref: null };
  }
  return applyStatus(connection, EConnectionStatus.Revoked, { auth_ref: null });
}

/** Soft-delete after revoke. Distinguishes revoke vs delete in audit. */
export function beginDelete(connection: IConnection): IConnection {
  if (
    connection.status === EConnectionStatus.Deleted ||
    connection.status === EConnectionStatus.Deleting
  ) {
    return connection;
  }
  const revoked =
    connection.status === EConnectionStatus.Revoked
      ? connection
      : revokeConnection(connection);
  return applyStatus(revoked, EConnectionStatus.Deleting, { auth_ref: null });
}

export function finishDelete(connection: IConnection): IConnection {
  return applyStatus(connection, EConnectionStatus.Deleted, { auth_ref: null });
}

const CREDENTIAL_KEY =
  /^(.*_)?(password|secret|token|api[_-]?key|oauth|credential|access_token|refresh_token)(_.*)?$/i;

/**
 * Strip accidental credential-shaped fields before a response leaves the
 * service boundary. Defense in depth for mock + future API.
 */
export function sanitizeConnectionForClient<T extends object>(raw: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (CREDENTIAL_KEY.test(key) && key !== "auth_ref") continue;
    if (
      key === "auth_ref" &&
      typeof value === "string" &&
      value.split(".").length === 3 &&
      value.length > 40
    ) {
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

/** Callback state must match the pending request exactly (CSRF). */
export function validateCallbackState(request: IConnectionRequest, state: string): void {
  if (request.state !== state) {
    throw new Error("OAuth state mismatch — possible CSRF or replay.");
  }
  if (Date.parse(request.expires_at) <= Date.now()) {
    throw new Error("Connection request expired. Start authorization again.");
  }
}

/**
 * Connections are workspace-bound. Rebinding requires fresh consent —
 * never mutate workspace_slug in place.
 */
export function assertSameWorkspace(connection: IConnection, workspaceSlug: string): void {
  if (connection.workspace_slug !== workspaceSlug) {
    throw new Error(
      "A connection cannot be rebound across workspaces without new consent.",
    );
  }
}
