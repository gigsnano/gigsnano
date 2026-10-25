import {
  ECapabilityAccess,
  type IConnectorCapability,
  type IConnectorManifest,
  type IConnectorPolicyContext,
} from "@/types/solution/connector";
import {
  EConnectionStatus,
  type IConnection,
} from "@/types/solution/connection";
import {
  EHealthState,
  type IConnectionHealth,
} from "@/types/solution/connection-ops";

/**
 * Apps & Integrations catalog (GIN-457).
 *
 * Integrations are discovered by the *outcome* they unlock, so entries rank on
 * how well their capabilities match what the caller needs — never on "featured"
 * or "recently added". Policy is applied here, not in the UI: a capability the
 * policy forbids is never offered for consent.
 */

export enum ECatalogSection {
  Discover = "discover",
  Installed = "installed",
  Requests = "requests",
}

export interface ICatalogCapabilityView extends IConnectorCapability {
  /** False when a policy layer forbids it — the UI must not offer consent. */
  permitted: boolean;
  /** Why it is unavailable. Null when permitted. */
  denied_reason: string | null;
}

export interface ICatalogEntry {
  manifest: IConnectorManifest;
  section: ECatalogSection;
  capabilities: ICatalogCapabilityView[];
  /** Capability labels this integration unlocks, for the card headline. */
  unlocks: string[];
  /** Data classes the integration reads. */
  reads: string[];
  /** Capability labels that write back to the provider. */
  writes: string[];
  /** Admin action is needed before a member can connect. */
  requires_admin: boolean;
  connection: IConnection | null;
  health: IConnectionHealth | null;
  /** Ranking score against the requested capabilities. Higher is more relevant. */
  relevance: number;
}

export interface ICatalogQuery {
  /** Capabilities the caller needs — from a blueprint or a blocked step. */
  requested_capabilities?: string[];
  /** Free-text filter over name, provider and capability labels. */
  search?: string;
  /** Restrict to one section. */
  section?: ECatalogSection;
  /** Caller can perform admin-gated installs. */
  is_admin?: boolean;
  /** Hide entries the caller cannot install at all. */
  installable_only?: boolean;
}

function denialReason(
  capabilityKey: string,
  policy: IConnectorPolicyContext,
): string | null {
  if (policy.organization_deny_capabilities?.includes(capabilityKey)) {
    return "Blocked by an organization policy.";
  }
  if (policy.workspace_deny_capabilities?.includes(capabilityKey)) {
    return "Blocked by a workspace policy.";
  }
  if (
    policy.solution_allowed_capabilities &&
    !policy.solution_allowed_capabilities.includes(capabilityKey)
  ) {
    return "Not allowed for this solution.";
  }
  if (
    policy.container_allowed_capabilities &&
    !policy.container_allowed_capabilities.includes(capabilityKey)
  ) {
    return "Not allowed in this container.";
  }
  return null;
}

function sectionFor(connection: IConnection | null): ECatalogSection {
  if (!connection) return ECatalogSection.Discover;
  switch (connection.status) {
    case EConnectionStatus.Requested:
    case EConnectionStatus.AwaitingAdmin:
    case EConnectionStatus.Authorizing:
      return ECatalogSection.Requests;
    case EConnectionStatus.Revoked:
    case EConnectionStatus.Deleted:
      return ECatalogSection.Discover;
    default:
      return ECatalogSection.Installed;
  }
}

export function buildCatalogEntry(
  manifest: IConnectorManifest,
  policy: IConnectorPolicyContext,
  connection: IConnection | null,
  health: IConnectionHealth | null,
  requested: string[] = [],
): ICatalogEntry {
  const capabilities: ICatalogCapabilityView[] = manifest.capabilities.map((capability) => {
    const denied_reason = denialReason(capability.key, policy);
    return { ...capability, permitted: denied_reason === null, denied_reason };
  });

  const permitted = capabilities.filter((c) => c.permitted);
  const matched = permitted.filter((c) => requested.includes(c.key));

  return {
    manifest,
    section: sectionFor(connection),
    capabilities,
    unlocks: permitted.map((c) => c.label),
    reads: [
      ...new Set(
        permitted
          .filter((c) => c.access === ECapabilityAccess.Read)
          .flatMap((c) => c.data_classes),
      ),
    ],
    writes: permitted
      .filter((c) => c.access === ECapabilityAccess.Write)
      .map((c) => c.label),
    requires_admin: manifest.admin_prerequisites.length > 0,
    connection,
    health,
    relevance: requested.length === 0 ? 0 : matched.length / requested.length,
  };
}

/**
 * Filter and rank the catalog. Ordering is relevance first, then already-
 * installed, then name — deterministic, and never a merchandising ranking.
 */
export function queryCatalog(
  entries: ICatalogEntry[],
  query: ICatalogQuery = {},
): ICatalogEntry[] {
  const search = query.search?.trim().toLowerCase() ?? "";

  return entries
    .filter((entry) => {
      if (query.section && entry.section !== query.section) return false;
      if (query.installable_only && !entry.capabilities.some((c) => c.permitted)) return false;
      if (query.installable_only && entry.requires_admin && query.is_admin === false) return false;
      if (
        query.requested_capabilities?.length &&
        entry.relevance === 0 &&
        entry.section === ECatalogSection.Discover
      ) {
        return false;
      }
      if (!search) return true;
      const haystack = [
        entry.manifest.name,
        entry.manifest.provider,
        ...entry.capabilities.map((c) => c.label),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      const aInstalled = a.section === ECatalogSection.Installed ? 0 : 1;
      const bInstalled = b.section === ECatalogSection.Installed ? 0 : 1;
      if (aInstalled !== bInstalled) return aInstalled - bInstalled;
      return a.manifest.name.localeCompare(b.manifest.name);
    });
}

export interface IPermissionDelta {
  /** Capabilities the user is being asked to grant for the first time. */
  added: ICatalogCapabilityView[];
  /** Already granted — shown so consent is a comparison, not a re-ask. */
  unchanged: ICatalogCapabilityView[];
  /** Currently granted but not requested; kept unless the user revokes. */
  removed: string[];
  /** True when this consent increases access and therefore needs approval. */
  increases_access: boolean;
  /** True when nothing being requested writes to the provider. */
  read_only: boolean;
}

/** Compare what is granted today against what is being requested. */
export function comparePermissions(
  entry: ICatalogEntry,
  requestedCapabilities: string[],
): IPermissionDelta {
  const granted = entry.connection?.granted_capabilities ?? [];
  const requestable = entry.capabilities.filter(
    (c) => c.permitted && requestedCapabilities.includes(c.key),
  );

  const added = requestable.filter((c) => !granted.includes(c.key));
  const unchanged = requestable.filter((c) => granted.includes(c.key));

  return {
    added,
    unchanged,
    removed: granted.filter((key) => !requestedCapabilities.includes(key)),
    increases_access: added.length > 0,
    read_only: requestable.every((c) => c.access === ECapabilityAccess.Read),
  };
}

/**
 * Guard the consent action. Returns the reason consent must be refused, or
 * null when it may proceed — a forbidden capability can never be consented to.
 */
export function consentBlockedReason(
  entry: ICatalogEntry,
  requestedCapabilities: string[],
  isAdmin: boolean,
): string | null {
  const forbidden = requestedCapabilities.filter((key) => {
    const capability = entry.capabilities.find((c) => c.key === key);
    return !capability || !capability.permitted;
  });

  if (forbidden.length > 0) {
    const first = entry.capabilities.find((c) => c.key === forbidden[0]);
    return first?.denied_reason ?? `"${forbidden[0]}" is not offered by this integration.`;
  }
  if (entry.requires_admin && !isAdmin) {
    return "An admin has to approve this integration before it can be connected.";
  }
  if (requestedCapabilities.length === 0) {
    return "Choose at least one capability to grant.";
  }
  return null;
}

/** What an admin sees on an approval request — exact scopes and destination. */
export interface IAdminApprovalRequest {
  connector_key: string;
  connector_version: number;
  requested_capabilities: string[];
  /** Provider-native scopes behind those capabilities. */
  provider_scopes: string[];
  container_id: string | null;
  container_label: string;
  requested_by: string;
  /** Where the user was when they asked, so approval can return them there. */
  origin_step: string | null;
  justification: string;
}

export function buildApprovalRequest(
  entry: ICatalogEntry,
  requestedCapabilities: string[],
  options: {
    requestedBy: string;
    containerId: string | null;
    containerLabel: string;
    originStep: string | null;
    justification: string;
  },
): IAdminApprovalRequest {
  const capabilities = entry.capabilities.filter((c) =>
    requestedCapabilities.includes(c.key),
  );

  return {
    connector_key: entry.manifest.key,
    connector_version: entry.manifest.version,
    requested_capabilities: capabilities.map((c) => c.key),
    provider_scopes: [...new Set(capabilities.flatMap((c) => c.provider_scopes))].sort(),
    container_id: options.containerId,
    container_label: options.containerLabel,
    requested_by: options.requestedBy,
    origin_step: options.originStep,
    justification: options.justification,
  };
}

/** Short health label for a catalog card. */
export function healthLabel(entry: ICatalogEntry): string {
  if (!entry.connection) return "Not connected";
  if (!entry.health) return "Connected";
  switch (entry.health.state) {
    case EHealthState.Healthy:
      return "Healthy";
    case EHealthState.Degraded:
      return "Degraded";
    case EHealthState.Failing:
      return "Needs attention";
    case EHealthState.Unknown:
      return "Not checked";
  }
}
