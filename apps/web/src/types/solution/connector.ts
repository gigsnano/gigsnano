/**
 * Connector manifest, capability and permission policy (GIN-455).
 *
 * Every integration declares what it can do and what access it needs *before*
 * any authorization or tool call. Manifests never store credentials.
 */

export enum EConnectorCategory {
  SourceControl = "source_control",
  Design = "design",
  Chat = "chat",
  Documents = "documents",
  Mail = "mail",
  ErpImport = "erp_import",
}

export enum EConnectorAuthMethod {
  OAuthApp = "oauth_app",
  OAuthUser = "oauth_user",
  ApiKey = "api_key",
  FileUpload = "file_upload",
  None = "none",
}

export enum ECapabilityAccess {
  Read = "read",
  Write = "write",
}

export enum ECapabilityRisk {
  Low = "low",
  Medium = "medium",
  High = "high",
}

export enum EDataClass {
  Public = "public",
  Internal = "internal",
  Confidential = "confidential",
  Restricted = "restricted",
}

export enum EPolicyDecision {
  Allow = "allow",
  Deny = "deny",
}

/** One capability the connector can grant. */
export interface IConnectorCapability {
  key: string;
  label: string;
  access: ECapabilityAccess;
  risk: ECapabilityRisk;
  /** Provider-native scopes that map to this capability. */
  provider_scopes: string[];
  data_classes: EDataClass[];
}

export interface IConnectorSourceSelector {
  key: string;
  label: string;
  /** e.g. repo, folder, mailbox, file */
  kind: string;
  scoping_levels: string[];
}

export interface IConnectorRateLimits {
  requests_per_minute: number | null;
  burst: number | null;
}

export interface IConnectorRetention {
  /** Days retained after disconnect; null = provider-default. */
  retain_days_after_disconnect: number | null;
  delete_on_disconnect: boolean;
  notes: string;
}

/**
 * Immutable released connector version. Increasing permissions requires a new
 * `version` and forces reauthorization — never mutate an existing release.
 */
export interface IConnectorManifest {
  key: string;
  version: number;
  name: string;
  provider: string;
  category: EConnectorCategory;
  auth_methods: EConnectorAuthMethod[];
  /** Org/workspace admin steps required before connect. */
  admin_prerequisites: string[];
  capabilities: IConnectorCapability[];
  source_selectors: IConnectorSourceSelector[];
  supports_health_check: boolean;
  supports_webhooks: boolean;
  supports_delta_sync: boolean;
  rate_limits: IConnectorRateLimits;
  retention: IConnectorRetention;
  docs_url: string | null;
  /** Minimum app version that understands this manifest. */
  min_app_version: string | null;
  /**
   * Forbidden fields (credentials, tokens, secrets) — validation rejects any
   * property whose key matches credential patterns.
   */
}

/** Consent recorded for a connection — capability grants, not UI labels. */
export interface IConnectorConsent {
  connector_key: string;
  /** Manifest version the user authorized. */
  manifest_version: number;
  /** Capability keys granted. Access is looked up from the manifest. */
  granted_capabilities: string[];
  /** True when every granted capability is read-only. */
  read_only: boolean;
}

/** Constraints layered on top of consent (org → workspace → solution → …). */
export interface IConnectorPolicyContext {
  organization_deny_capabilities?: string[];
  workspace_deny_capabilities?: string[];
  solution_allowed_capabilities?: string[] | null;
  container_allowed_capabilities?: string[] | null;
  blueprint_required_capabilities?: string[];
}

export interface IPolicyDecisionRecord {
  decision: EPolicyDecision;
  connector_key: string;
  capability_key: string;
  tool_access: ECapabilityAccess;
  reasons: string[];
  audited_at: string;
}
