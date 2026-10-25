import {
  ECapabilityAccess,
  EPolicyDecision,
  type IConnectorConsent,
  type IConnectorManifest,
  type IConnectorPolicyContext,
  type IPolicyDecisionRecord,
} from "@/types/solution/connector";

/**
 * Resolve whether a tool may run under the current consent + layered policy
 * (GIN-455). Unknown capabilities and missing grants fail closed.
 */

function findCapability(manifest: IConnectorManifest, capabilityKey: string) {
  return manifest.capabilities.find((c) => c.key === capabilityKey) ?? null;
}

function deny(
  connectorKey: string,
  capabilityKey: string,
  toolAccess: ECapabilityAccess,
  reasons: string[],
): IPolicyDecisionRecord {
  return {
    decision: EPolicyDecision.Deny,
    connector_key: connectorKey,
    capability_key: capabilityKey,
    tool_access: toolAccess,
    reasons,
    audited_at: new Date().toISOString(),
  };
}

function allow(
  connectorKey: string,
  capabilityKey: string,
  toolAccess: ECapabilityAccess,
  reasons: string[],
): IPolicyDecisionRecord {
  return {
    decision: EPolicyDecision.Allow,
    connector_key: connectorKey,
    capability_key: capabilityKey,
    tool_access: toolAccess,
    reasons,
    audited_at: new Date().toISOString(),
  };
}

/**
 * Authorize a tool call against the released manifest + consent + policy layers.
 * UI labels alone are never consulted — only capability keys.
 */
export function authorizeCapability(
  manifest: IConnectorManifest,
  consent: IConnectorConsent,
  capabilityKey: string,
  toolAccess: ECapabilityAccess,
  context: IConnectorPolicyContext = {},
): IPolicyDecisionRecord {
  if (consent.connector_key !== manifest.key) {
    return deny(manifest.key, capabilityKey, toolAccess, [
      "Consent connector_key does not match the manifest.",
    ]);
  }
  if (consent.manifest_version !== manifest.version) {
    return deny(manifest.key, capabilityKey, toolAccess, [
      `Consent is for manifest v${consent.manifest_version}; current release is v${manifest.version}. Reauthorize.`,
    ]);
  }

  const capability = findCapability(manifest, capabilityKey);
  if (!capability) {
    return deny(manifest.key, capabilityKey, toolAccess, [
      `Unknown capability "${capabilityKey}" — fail closed.`,
    ]);
  }

  if (!consent.granted_capabilities.includes(capabilityKey)) {
    return deny(manifest.key, capabilityKey, toolAccess, [
      `Capability "${capabilityKey}" was not granted in consent.`,
    ]);
  }

  if (toolAccess === ECapabilityAccess.Write) {
    if (capability.access !== ECapabilityAccess.Write) {
      return deny(manifest.key, capabilityKey, toolAccess, [
        `Capability "${capabilityKey}" is read-only on the manifest; write tools cannot run.`,
      ]);
    }
    if (consent.read_only) {
      return deny(manifest.key, capabilityKey, toolAccess, [
        "Write tool cannot execute under read-only consent.",
      ]);
    }
  }

  const denyLists = [
    ...(context.organization_deny_capabilities ?? []),
    ...(context.workspace_deny_capabilities ?? []),
  ];
  if (denyLists.includes(capabilityKey)) {
    return deny(manifest.key, capabilityKey, toolAccess, [
      `Capability "${capabilityKey}" is denied by organization/workspace policy.`,
    ]);
  }

  const solutionAllow = context.solution_allowed_capabilities;
  if (solutionAllow && !solutionAllow.includes(capabilityKey)) {
    return deny(manifest.key, capabilityKey, toolAccess, [
      `Capability "${capabilityKey}" is outside the solution allow-list.`,
    ]);
  }

  const containerAllow = context.container_allowed_capabilities;
  if (containerAllow && !containerAllow.includes(capabilityKey)) {
    return deny(manifest.key, capabilityKey, toolAccess, [
      `Capability "${capabilityKey}" is outside the container allow-list.`,
    ]);
  }

  return allow(manifest.key, capabilityKey, toolAccess, [
    "Granted by consent and permitted by policy layers.",
  ]);
}

/**
 * Least-privilege recommended capability set for a use case: prefer read over
 * write when both exist for the same logical action family.
 */
export function recommendedCapabilities(
  manifest: IConnectorManifest,
  needed: { key: string; access: ECapabilityAccess }[],
): string[] {
  const granted: string[] = [];
  for (const need of needed) {
    const exact = manifest.capabilities.find(
      (c) => c.key === need.key && c.access === need.access,
    );
    if (exact) {
      granted.push(exact.key);
      continue;
    }
    if (need.access === ECapabilityAccess.Write) {
      const readFallback = manifest.capabilities.find(
        (c) => c.key === need.key && c.access === ECapabilityAccess.Read,
      );
      if (readFallback) granted.push(readFallback.key);
    }
  }
  return granted;
}

/**
 * Detect whether a newer manifest increases permissions relative to the one
 * the user authorized. Any increase requires a new release + reauthorization.
 */
export function requiresReauthorization(
  previous: IConnectorManifest,
  next: IConnectorManifest,
): boolean {
  if (previous.key !== next.key) return true;
  if (next.version <= previous.version) return false;

  const prevCaps = new Map(previous.capabilities.map((c) => [c.key, c]));
  for (const cap of next.capabilities) {
    const old = prevCaps.get(cap.key);
    if (!old) return true;
    if (old.access === ECapabilityAccess.Read && cap.access === ECapabilityAccess.Write) {
      return true;
    }
    for (const scope of cap.provider_scopes) {
      if (!old.provider_scopes.includes(scope)) return true;
    }
  }
  return false;
}
