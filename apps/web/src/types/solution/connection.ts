/**
 * Secure connection authorization + lifecycle (GIN-456).
 *
 * Credentials never appear on these types — only opaque auth references.
 * Revoked connections deny runtime immediately; deletion is a separate audited
 * state after provider cleanup.
 */

export enum EConnectionStatus {
  Requested = "requested",
  AwaitingAdmin = "awaiting_admin",
  Authorizing = "authorizing",
  Connected = "connected",
  Degraded = "degraded",
  Expired = "expired",
  Revoked = "revoked",
  Deleting = "deleting",
  Deleted = "deleted",
}

export enum EConnectionScope {
  Workspace = "workspace",
  Container = "container",
  Organization = "organization",
}

/** Client-safe connection instance — no tokens, secrets, or API keys. */
export interface IConnection {
  id: string;
  workspace_slug: string;
  connector_key: string;
  connector_version: number;
  status: EConnectionStatus;
  scope: EConnectionScope;
  /** Container id when scope is container; otherwise null. */
  container_id: string | null;
  /** Provider account / tenant as reported by the provider (not a secret). */
  provider_account: string | null;
  provider_tenant: string | null;
  /** Capability keys granted at consent time (GIN-455). */
  granted_capabilities: string[];
  /** Provider scopes authorized — labels only, never secret material. */
  provider_scopes: string[];
  /**
   * Opaque reference into the secret manager. Never a credential value.
   * Clients must treat this as non-dereferenceable.
   */
  auth_ref: string | null;
  owner_id: string;
  read_only: boolean;
  recovery_hint: string | null;
  created_at: string;
  updated_at: string;
  connected_at: string | null;
  revoked_at: string | null;
  deleted_at: string | null;
}

export interface IConnectionRequest {
  id: string;
  workspace_slug: string;
  connector_key: string;
  connector_version: number;
  scope: EConnectionScope;
  container_id: string | null;
  /** The connection instance created for this request. */
  connection_id: string;
  requested_capabilities: string[];
  /** CSRF/OAuth state — single-use; validated on callback. */
  state: string;
  /** PKCE code challenge when the connector supports it. */
  pkce_challenge: string | null;
  status: EConnectionStatus;
  created_at: string;
  expires_at: string;
}

export interface ICreateConnectionRequestPayload {
  connector_key: string;
  connector_version: number;
  scope: EConnectionScope;
  container_id?: string | null;
  requested_capabilities: string[];
  read_only?: boolean;
}

export interface IConnectionCallbackPayload {
  state: string;
  code?: string | null;
  /** Provider account claimed by the callback — must match expected tenant. */
  provider_account?: string | null;
  provider_tenant?: string | null;
  /** Idempotency key so duplicate callbacks do not create a second connection. */
  idempotency_key: string;
}

export interface IConnectionAuditEvent {
  at: string;
  action: string;
  connection_id: string;
  detail: string;
}
