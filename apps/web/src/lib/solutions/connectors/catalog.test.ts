import { describe, expect, it } from "vitest";

import { EConnectionScope, EConnectionStatus, type IConnection } from "@/types/solution/connection";
import { EHealthErrorCategory, EHealthState, type IConnectionHealth } from "@/types/solution/connection-ops";
import type { IConnectorPolicyContext } from "@/types/solution/connector";

import {
  buildApprovalRequest,
  buildCatalogEntry,
  comparePermissions,
  consentBlockedReason,
  ECatalogSection,
  healthLabel,
  queryCatalog,
} from "./catalog";
import { documentStoreConnector, githubConnector, slackTeamsConnector } from "./fixtures";

const NO_POLICY: IConnectorPolicyContext = {};

function connection(overrides: Partial<IConnection> = {}): IConnection {
  return {
    id: "conn-1",
    workspace_slug: "acme",
    connector_key: "github",
    connector_version: 1,
    status: EConnectionStatus.Connected,
    scope: EConnectionScope.Workspace,
    container_id: null,
    provider_account: "acme",
    provider_tenant: "acme",
    granted_capabilities: ["repos.read"],
    provider_scopes: ["repo"],
    auth_ref: "sm://github/conn-1",
    owner_id: "user-1",
    read_only: true,
    recovery_hint: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    connected_at: "2026-07-01T00:00:00.000Z",
    revoked_at: null,
    deleted_at: null,
    ...overrides,
  };
}

function entryFor(
  manifest = githubConnector,
  policy = NO_POLICY,
  conn: IConnection | null = null,
  health: IConnectionHealth | null = null,
  requested: string[] = [],
) {
  return buildCatalogEntry(manifest, policy, conn, health, requested);
}

describe("buildCatalogEntry", () => {
  it("describes what the integration unlocks, reads and writes", () => {
    const entry = entryFor();

    expect(entry.unlocks.length).toBeGreaterThan(0);
    expect(entry.reads.length).toBeGreaterThan(0);
    expect(entry.section).toBe(ECatalogSection.Discover);
  });

  it("marks policy-denied capabilities as unavailable with a reason", () => {
    const entry = entryFor(githubConnector, {
      organization_deny_capabilities: ["repos.write"],
    });
    const write = entry.capabilities.find((c) => c.key === "repos.write");

    expect(write?.permitted).toBe(false);
    expect(write?.denied_reason).toMatch(/organization policy/);
    expect(entry.unlocks).not.toContain(write?.label);
  });

  it("keeps a solution allow-list from leaking other capabilities", () => {
    const entry = entryFor(githubConnector, {
      solution_allowed_capabilities: ["repos.read"],
    });

    expect(entry.capabilities.filter((c) => c.permitted).map((c) => c.key)).toEqual([
      "repos.read",
    ]);
  });

  it("files a connected integration under Installed and a pending one under Requests", () => {
    expect(entryFor(githubConnector, NO_POLICY, connection()).section).toBe(
      ECatalogSection.Installed,
    );
    expect(
      entryFor(
        githubConnector,
        NO_POLICY,
        connection({ status: EConnectionStatus.AwaitingAdmin }),
      ).section,
    ).toBe(ECatalogSection.Requests);
  });

  it("returns a revoked integration to Discover so it can be reinstalled", () => {
    const entry = entryFor(
      githubConnector,
      NO_POLICY,
      connection({ status: EConnectionStatus.Revoked }),
    );

    expect(entry.section).toBe(ECatalogSection.Discover);
  });
});

describe("queryCatalog", () => {
  const entries = [
    entryFor(slackTeamsConnector),
    entryFor(githubConnector, NO_POLICY, connection()),
    entryFor(documentStoreConnector),
  ];

  it("ranks by requested capability relevance, not by name or novelty", () => {
    const ranked = queryCatalog(
      [
        entryFor(slackTeamsConnector, NO_POLICY, null, null, ["repos.read"]),
        entryFor(documentStoreConnector, NO_POLICY, null, null, ["repos.read"]),
        entryFor(githubConnector, NO_POLICY, null, null, ["repos.read"]),
      ],
      { requested_capabilities: ["repos.read"] },
    );

    expect(ranked[0].manifest.key).toBe("github");
  });

  it("hides irrelevant integrations during a contextual install", () => {
    const ranked = queryCatalog(
      [
        entryFor(slackTeamsConnector, NO_POLICY, null, null, ["repos.read"]),
        entryFor(githubConnector, NO_POLICY, null, null, ["repos.read"]),
      ],
      { requested_capabilities: ["repos.read"] },
    );

    expect(ranked.map((e) => e.manifest.key)).toEqual(["github"]);
  });

  it("filters by section", () => {
    const installed = queryCatalog(entries, { section: ECatalogSection.Installed });

    expect(installed.map((e) => e.manifest.key)).toEqual(["github"]);
  });

  it("searches name, provider and capability labels", () => {
    expect(queryCatalog(entries, { search: "github" })).toHaveLength(1);
    expect(queryCatalog(entries, { search: "zzz-nothing" })).toHaveLength(0);
  });

  it("puts installed integrations ahead of undiscovered ones when relevance ties", () => {
    const ordered = queryCatalog(entries);

    expect(ordered[0].manifest.key).toBe("github");
  });
});

describe("comparePermissions", () => {
  it("separates newly requested access from what is already granted", () => {
    const entry = entryFor(githubConnector, NO_POLICY, connection());
    const delta = comparePermissions(entry, ["repos.read", "repos.write"]);

    expect(delta.unchanged.map((c) => c.key)).toEqual(["repos.read"]);
    expect(delta.added.map((c) => c.key)).toEqual(["repos.write"]);
    expect(delta.increases_access).toBe(true);
    expect(delta.read_only).toBe(false);
  });

  it("reports a read-only request that grants nothing new", () => {
    const entry = entryFor(githubConnector, NO_POLICY, connection());
    const delta = comparePermissions(entry, ["repos.read"]);

    expect(delta.increases_access).toBe(false);
    expect(delta.read_only).toBe(true);
  });

  it("never counts a policy-denied capability as grantable", () => {
    const entry = entryFor(
      githubConnector,
      { workspace_deny_capabilities: ["repos.write"] },
      connection(),
    );
    const delta = comparePermissions(entry, ["repos.read", "repos.write"]);

    expect(delta.added).toEqual([]);
    expect(delta.increases_access).toBe(false);
  });
});

describe("consentBlockedReason", () => {
  it("refuses consent to a capability the policy forbids", () => {
    const entry = entryFor(githubConnector, { workspace_deny_capabilities: ["repos.write"] });

    expect(consentBlockedReason(entry, ["repos.write"], true)).toMatch(/workspace policy/);
  });

  it("refuses consent to a capability the connector does not offer", () => {
    const entry = entryFor(githubConnector);

    expect(consentBlockedReason(entry, ["mail.read"], true)).toMatch(/not offered/);
  });

  it("requires an admin when the connector has admin prerequisites", () => {
    const entry = entryFor(slackTeamsConnector);

    if (entry.requires_admin) {
      expect(consentBlockedReason(entry, [entry.capabilities[0].key], false)).toMatch(
        /admin/,
      );
      expect(consentBlockedReason(entry, [entry.capabilities[0].key], true)).toBeNull();
    }
  });

  it("requires at least one capability", () => {
    expect(consentBlockedReason(entryFor(), [], true)).toMatch(/at least one/);
  });

  it("allows a permitted request", () => {
    expect(consentBlockedReason(entryFor(), ["repos.read"], true)).toBeNull();
  });
});

describe("buildApprovalRequest", () => {
  it("carries the exact scopes, container and origin back to the admin", () => {
    const request = buildApprovalRequest(entryFor(), ["repos.read", "repos.write"], {
      requestedBy: "user-1",
      containerId: "proj-1",
      containerLabel: "Acme Web",
      originStep: "connect",
      justification: "The blueprint needs to open pull requests.",
    });

    expect(request.requested_capabilities).toEqual(["repos.read", "repos.write"]);
    expect(request.provider_scopes.length).toBeGreaterThan(0);
    expect(request.provider_scopes).toEqual([...request.provider_scopes].sort());
    expect(request.container_label).toBe("Acme Web");
    expect(request.origin_step).toBe("connect");
  });
});

describe("healthLabel", () => {
  it("distinguishes not-connected, healthy and failing", () => {
    expect(healthLabel(entryFor())).toBe("Not connected");
    expect(
      healthLabel(
        entryFor(githubConnector, NO_POLICY, connection(), {
          connection_id: "conn-1",
          state: EHealthState.Failing,
          category: EHealthErrorCategory.AuthExpired,
          summary: "Expired.",
          action: "Reconnect.",
          last_success_at: null,
          last_checked_at: null,
          consecutive_failures: 1,
          next_retry_at: null,
          requires_reauthorization: true,
        }),
      ),
    ).toBe("Needs attention");
  });
});
