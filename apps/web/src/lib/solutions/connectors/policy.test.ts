import { describe, expect, it } from "vitest";

import {
  ECapabilityAccess,
  EPolicyDecision,
  type IConnectorConsent,
  type IConnectorManifest,
} from "@/types/solution/connector";

import {
  CONNECTOR_FIXTURES,
  authorizeCapability,
  githubConnector,
  recommendedCapabilities,
  requiresReauthorization,
} from "./index";

const readConsent: IConnectorConsent = {
  connector_key: "github",
  manifest_version: 1,
  granted_capabilities: ["repos.read"],
  read_only: true,
};

/** Granted write capability but consent flagged read-only — must still deny writes. */
const readOnlyWithWriteGrant: IConnectorConsent = {
  connector_key: "github",
  manifest_version: 1,
  granted_capabilities: ["repos.read", "repos.write"],
  read_only: true,
};

const writeConsent: IConnectorConsent = {
  connector_key: "github",
  manifest_version: 1,
  granted_capabilities: ["repos.read", "repos.write"],
  read_only: false,
};

describe("connector fixtures", () => {
  it("covers the six required providers", () => {
    const keys = CONNECTOR_FIXTURES.map((c) => c.key).sort();
    expect(keys).toEqual([
      "document_store",
      "erp_file_import",
      "figma",
      "github",
      "shared_mailbox",
      "slack_teams",
    ]);
  });
});

describe("authorizeCapability", () => {
  it("denies write tools under read-only consent", () => {
    const decision = authorizeCapability(
      githubConnector,
      readOnlyWithWriteGrant,
      "repos.write",
      ECapabilityAccess.Write,
    );
    expect(decision.decision).toBe(EPolicyDecision.Deny);
    expect(decision.reasons.some((r) => /read-only/i.test(r))).toBe(true);
  });

  it("denies capabilities not in consent", () => {
    const decision = authorizeCapability(
      githubConnector,
      readConsent,
      "repos.write",
      ECapabilityAccess.Read,
    );
    expect(decision.decision).toBe(EPolicyDecision.Deny);
  });

  it("fails closed on unknown capabilities", () => {
    const decision = authorizeCapability(
      githubConnector,
      readConsent,
      "repos.delete",
      ECapabilityAccess.Write,
    );
    expect(decision.decision).toBe(EPolicyDecision.Deny);
    expect(decision.reasons.some((r) => /Unknown capability/i.test(r))).toBe(true);
  });

  it("allows granted read under matching consent", () => {
    const decision = authorizeCapability(
      githubConnector,
      readConsent,
      "repos.read",
      ECapabilityAccess.Read,
    );
    expect(decision.decision).toBe(EPolicyDecision.Allow);
  });

  it("allows write when consent grants write and is not read-only", () => {
    const decision = authorizeCapability(
      githubConnector,
      writeConsent,
      "repos.write",
      ECapabilityAccess.Write,
    );
    expect(decision.decision).toBe(EPolicyDecision.Allow);
  });

  it("denies when workspace policy blocks the capability", () => {
    const decision = authorizeCapability(
      githubConnector,
      writeConsent,
      "repos.write",
      ECapabilityAccess.Write,
      { workspace_deny_capabilities: ["repos.write"] },
    );
    expect(decision.decision).toBe(EPolicyDecision.Deny);
  });

  it("requires reauthorization when consent version lags", () => {
    const decision = authorizeCapability(
      { ...githubConnector, version: 2 },
      writeConsent,
      "repos.write",
      ECapabilityAccess.Write,
    );
    expect(decision.decision).toBe(EPolicyDecision.Deny);
    expect(decision.reasons.some((r) => /Reauthorize/i.test(r))).toBe(true);
  });
});

describe("requiresReauthorization", () => {
  it("is true when a new version adds write capability", () => {
    const next: IConnectorManifest = {
      ...githubConnector,
      version: 2,
      capabilities: [
        ...githubConnector.capabilities,
        {
          key: "hooks.write",
          label: "Manage webhooks",
          access: ECapabilityAccess.Write,
          risk: githubConnector.capabilities[0]!.risk,
          provider_scopes: ["hooks:write"],
          data_classes: githubConnector.capabilities[0]!.data_classes,
        },
      ],
    };
    expect(requiresReauthorization(githubConnector, next)).toBe(true);
  });

  it("is false when only docs change at same permissions", () => {
    const next = { ...githubConnector, version: 2, docs_url: "https://example.com" };
    expect(requiresReauthorization(githubConnector, next)).toBe(false);
  });
});

describe("recommendedCapabilities", () => {
  it("prefers exact access matches", () => {
    expect(
      recommendedCapabilities(githubConnector, [
        { key: "repos.read", access: ECapabilityAccess.Read },
      ]),
    ).toEqual(["repos.read"]);
  });
});
