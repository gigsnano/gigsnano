import { describe, expect, it } from "vitest";

import { EConnectionScope, EConnectionStatus, type IConnection } from "@/types/solution/connection";
import {
  EConnectionAuditAction,
  EDependentKind,
  EHealthErrorCategory,
  EHealthState,
  EUninstallStepStatus,
  type IConnectionDependent,
  type IConnectionHealth,
  type ISubscriptionRenewal,
  type IUninstallJob,
} from "@/types/solution/connection-ops";

import {
  auditTimeline,
  buildDependencyGraph,
  degradedNotice,
  evaluateHealth,
  expiringSubscriptions,
  healthAlerts,
  isUsableFromCachedSession,
  nextRetryAt,
  previewUninstall,
  recordPermissionIncrease,
  summarizeUninstall,
} from "./operations";

const NOW = new Date("2026-07-26T12:00:00.000Z");

function connection(overrides: Partial<IConnection> = {}): IConnection {
  return {
    id: "conn-1",
    workspace_slug: "acme",
    connector_key: "github",
    connector_version: 1,
    status: EConnectionStatus.Connected,
    scope: EConnectionScope.Workspace,
    container_id: null,
    provider_account: "acme-bot",
    provider_tenant: "acme",
    granted_capabilities: ["repos.read"],
    provider_scopes: ["repo:read"],
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

function health(overrides: Partial<IConnectionHealth> = {}): IConnectionHealth {
  return {
    connection_id: "conn-1",
    state: EHealthState.Healthy,
    category: EHealthErrorCategory.None,
    summary: "Working normally.",
    action: null,
    last_success_at: NOW.toISOString(),
    last_checked_at: NOW.toISOString(),
    consecutive_failures: 0,
    next_retry_at: null,
    requires_reauthorization: false,
    ...overrides,
  };
}

function subscription(overrides: Partial<ISubscriptionRenewal> = {}): ISubscriptionRenewal {
  return {
    id: "sub-1",
    connection_id: "conn-1",
    label: "Pull request events",
    expires_at: "2026-07-27T12:00:00.000Z",
    last_renewed_at: "2026-07-20T12:00:00.000Z",
    auto_renew: true,
    ...overrides,
  };
}

describe("evaluateHealth", () => {
  it("reports a successful check as healthy and resets the failure count", () => {
    const result = evaluateHealth({
      connection: connection(),
      category: EHealthErrorCategory.None,
      checked_at: NOW.toISOString(),
      last_success_at: "2026-07-25T12:00:00.000Z",
      previous_failures: 4,
    });

    expect(result.state).toBe(EHealthState.Healthy);
    expect(result.consecutive_failures).toBe(0);
    expect(result.next_retry_at).toBeNull();
    expect(result.last_success_at).toBe(NOW.toISOString());
  });

  it("treats rate limiting as degraded and retryable rather than failing", () => {
    const result = evaluateHealth({
      connection: connection(),
      category: EHealthErrorCategory.RateLimited,
      checked_at: NOW.toISOString(),
      last_success_at: null,
      previous_failures: 0,
    });

    expect(result.state).toBe(EHealthState.Degraded);
    expect(result.requires_reauthorization).toBe(false);
    expect(result.next_retry_at).not.toBeNull();
  });

  it("flags expired auth as failing and needing reauthorization", () => {
    const result = evaluateHealth({
      connection: connection(),
      category: EHealthErrorCategory.AuthExpired,
      checked_at: NOW.toISOString(),
      last_success_at: null,
      previous_failures: 1,
    });

    expect(result.state).toBe(EHealthState.Failing);
    expect(result.requires_reauthorization).toBe(true);
    expect(result.action).toMatch(/Reconnect/);
    expect(result.consecutive_failures).toBe(2);
  });

  it("never echoes provider detail — only the fixed category copy", () => {
    const categories = Object.values(EHealthErrorCategory);

    for (const category of categories) {
      const result = evaluateHealth({
        connection: connection(),
        category,
        checked_at: NOW.toISOString(),
        last_success_at: null,
        previous_failures: 0,
      });

      expect(result.summary).not.toMatch(/acme-bot|sm:\/\/|token|secret/i);
    }
  });

  it("stops checking a revoked connection", () => {
    const result = evaluateHealth({
      connection: connection({
        status: EConnectionStatus.Revoked,
        revoked_at: NOW.toISOString(),
      }),
      category: EHealthErrorCategory.AuthExpired,
      checked_at: NOW.toISOString(),
      last_success_at: null,
      previous_failures: 2,
    });

    expect(result.state).toBe(EHealthState.Unknown);
    expect(result.next_retry_at).toBeNull();
    expect(result.requires_reauthorization).toBe(false);
  });

  it("backs off further on each consecutive failure, then caps", () => {
    const first = new Date(nextRetryAt(1, NOW)).getTime() - NOW.getTime();
    const third = new Date(nextRetryAt(3, NOW)).getTime() - NOW.getTime();
    const huge = new Date(nextRetryAt(50, NOW)).getTime() - NOW.getTime();

    expect(third).toBeGreaterThan(first);
    expect(huge).toBe(3_600_000);
  });
});

describe("alerting", () => {
  it("lists subscriptions inside the renewal window, soonest first", () => {
    const result = expiringSubscriptions(
      [
        subscription({ id: "far", expires_at: "2026-08-30T12:00:00.000Z" }),
        subscription({ id: "soon", expires_at: "2026-07-27T00:00:00.000Z" }),
        subscription({ id: "later", expires_at: "2026-07-28T00:00:00.000Z" }),
      ],
      NOW,
    );

    expect(result.map((s) => s.id)).toEqual(["soon", "later"]);
  });

  it("raises operator alerts for repeated failures, reauth and expiry", () => {
    const alerts = healthAlerts(
      [connection()],
      [
        health({
          state: EHealthState.Failing,
          category: EHealthErrorCategory.AuthExpired,
          consecutive_failures: 3,
          requires_reauthorization: true,
        }),
      ],
      [subscription()],
      NOW,
    );

    expect(alerts.map((a) => a.code)).toEqual([
      "repeated_failures",
      "reauthorization_required",
      "subscription_expiring",
    ]);
  });

  it("stays quiet while everything is healthy", () => {
    expect(healthAlerts([connection()], [health()], [], NOW)).toEqual([]);
  });
});

describe("degradedNotice", () => {
  it("gives the journey UI an actionable message", () => {
    const notice = degradedNotice(
      connection({ status: EConnectionStatus.Degraded }),
      health({
        state: EHealthState.Failing,
        category: EHealthErrorCategory.ScopeInsufficient,
        summary: "The integration no longer has every permission it needs.",
        action: "Reauthorize to grant the missing permissions.",
      }),
    );

    expect(notice?.action).toMatch(/Reauthorize/);
    expect(notice?.requires_admin).toBe(false);
  });

  it("routes configuration problems to an admin", () => {
    const notice = degradedNotice(
      connection({ status: EConnectionStatus.Degraded }),
      health({
        state: EHealthState.Failing,
        category: EHealthErrorCategory.ConfigurationInvalid,
      }),
    );

    expect(notice?.requires_admin).toBe(true);
  });

  it("says nothing when the connection is healthy", () => {
    expect(degradedNotice(connection(), health())).toBeNull();
  });
});

describe("uninstall", () => {
  const dependents: IConnectionDependent[] = [
    {
      kind: EDependentKind.Agent,
      key: "assurance_lead",
      label: "Assurance lead agent",
      capabilities: ["repos.read"],
      critical: true,
    },
    {
      kind: EDependentKind.Ingestion,
      key: "nightly",
      label: "Nightly invoice ingest",
      capabilities: ["files.read"],
      critical: false,
    },
  ];

  it("counts critical dependents in the graph", () => {
    const graph = buildDependencyGraph("conn-1", dependents);

    expect(graph.critical_count).toBe(1);
  });

  it("previews every consequence without writing anything", () => {
    const preview = previewUninstall(
      buildDependencyGraph("conn-1", dependents),
      [subscription()],
      "purge",
    );

    expect(preview.actions_stopped).toEqual(["Assurance lead agent"]);
    expect(preview.retrieval_disabled).toEqual(["Nightly invoice ingest"]);
    expect(preview.subscriptions_removed).toEqual(["Pull request events"]);
    expect(preview.retention_consequence).toMatch(/deleted within 24 hours/);
    expect(preview.blocks_critical_work).toBe(true);
  });

  it("refuses to claim completion while provider cleanup is pending", () => {
    const job: IUninstallJob = {
      connection_id: "conn-1",
      steps: [
        { key: "stop", label: "Stop actions", status: EUninstallStepStatus.Done, detail: null },
        {
          key: "provider",
          label: "Remove provider subscriptions",
          status: EUninstallStepStatus.Running,
          detail: null,
        },
      ],
      complete: true,
      requires_manual_recovery: false,
      started_at: NOW.toISOString(),
      finished_at: NOW.toISOString(),
    };

    const result = summarizeUninstall(job);

    expect(result.complete).toBe(false);
    expect(result.finished_at).toBeNull();
  });

  it("surfaces manual recovery instead of completing", () => {
    const result = summarizeUninstall({
      connection_id: "conn-1",
      steps: [
        { key: "stop", label: "Stop actions", status: EUninstallStepStatus.Done, detail: null },
        {
          key: "purge",
          label: "Purge retrieved data",
          status: EUninstallStepStatus.ManualRecoveryRequired,
          detail: "Provider rejected the purge request.",
        },
      ],
      complete: false,
      requires_manual_recovery: false,
      started_at: NOW.toISOString(),
      finished_at: null,
    });

    expect(result.requires_manual_recovery).toBe(true);
    expect(result.complete).toBe(false);
  });

  it("completes once every step is done", () => {
    const result = summarizeUninstall({
      connection_id: "conn-1",
      steps: [
        { key: "stop", label: "Stop actions", status: EUninstallStepStatus.Done, detail: null },
      ],
      complete: false,
      requires_manual_recovery: false,
      started_at: NOW.toISOString(),
      finished_at: null,
    });

    expect(result.complete).toBe(true);
    expect(result.finished_at).not.toBeNull();
  });
});

describe("cached agent sessions", () => {
  it("rejects a connection revoked after the session cached it", () => {
    const revoked = connection({
      status: EConnectionStatus.Revoked,
      revoked_at: "2026-07-26T11:00:00.000Z",
      updated_at: "2026-07-26T11:00:00.000Z",
    });

    expect(isUsableFromCachedSession(revoked, "2026-07-26T10:00:00.000Z")).toBe(false);
  });

  it("rejects a connection changed since the session cached it", () => {
    const changed = connection({ updated_at: "2026-07-26T11:00:00.000Z" });

    expect(isUsableFromCachedSession(changed, "2026-07-26T10:00:00.000Z")).toBe(false);
  });

  it("allows an unchanged, connected connection", () => {
    expect(isUsableFromCachedSession(connection(), "2026-07-26T10:00:00.000Z")).toBe(true);
  });
});

describe("audit", () => {
  it("always pairs a permission increase with an approval request", () => {
    const entries = recordPermissionIncrease(
      connection(),
      ["repos.write"],
      ["repo:write"],
      "user-1",
    );

    expect(entries.map((e) => e.action)).toEqual([
      EConnectionAuditAction.PermissionIncreased,
      EConnectionAuditAction.ApprovalRequested,
    ]);
    expect(entries[1].scopes).toEqual(["repo:write"]);
  });

  it("records nothing when no permission actually increased", () => {
    expect(recordPermissionIncrease(connection(), [], [], "user-1")).toEqual([]);
  });

  it("orders the timeline chronologically", () => {
    const entries = auditTimeline([
      {
        id: "b",
        connection_id: "conn-1",
        action: EConnectionAuditAction.Authorized,
        at: "2026-07-02T00:00:00.000Z",
        actor_id: "user-1",
        approver_id: null,
        capability_key: null,
        scopes: [],
        detail: "Authorized.",
      },
      {
        id: "a",
        connection_id: "conn-1",
        action: EConnectionAuditAction.Requested,
        at: "2026-07-01T00:00:00.000Z",
        actor_id: "user-1",
        approver_id: null,
        capability_key: null,
        scopes: [],
        detail: "Requested.",
      },
    ]);

    expect(entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
