import { describe, expect, it } from "vitest";

import {
  EConnectionScope,
  EConnectionStatus,
  type IConnection,
  type IConnectionRequest,
} from "@/types/solution/connection";

import {
  applyStatus,
  assertSameWorkspace,
  beginDelete,
  canUseConnection,
  finishDelete,
  recoveryInstructions,
  revokeConnection,
  sanitizeConnectionForClient,
  validateCallbackState,
} from "./index";

function connection(partial: Partial<IConnection> = {}): IConnection {
  const now = "2026-07-26T00:00:00.000Z";
  return {
    id: "conn-1",
    workspace_slug: "acme",
    connector_key: "github",
    connector_version: 1,
    status: EConnectionStatus.Connected,
    scope: EConnectionScope.Workspace,
    container_id: null,
    provider_account: "acme-org",
    provider_tenant: "tenant-1",
    granted_capabilities: ["repos.read"],
    provider_scopes: ["metadata:read"],
    auth_ref: "sm://github/conn-1",
    owner_id: "user-1",
    read_only: true,
    recovery_hint: null,
    created_at: now,
    updated_at: now,
    connected_at: now,
    revoked_at: null,
    deleted_at: null,
    ...partial,
  };
}

describe("canUseConnection", () => {
  it("allows only connected with auth_ref", () => {
    expect(canUseConnection(connection())).toBe(true);
    expect(
      canUseConnection(connection({ status: EConnectionStatus.Degraded })),
    ).toBe(false);
    expect(canUseConnection(connection({ auth_ref: null }))).toBe(false);
  });

  it("surfaces recovery instructions for expired/degraded", () => {
    expect(
      recoveryInstructions(connection({ status: EConnectionStatus.Expired })),
    ).toMatch(/Reauthorize/i);
    expect(
      recoveryInstructions(connection({ status: EConnectionStatus.Degraded })),
    ).toMatch(/degraded/i);
  });
});

describe("revoke vs delete", () => {
  it("clears auth_ref immediately on revoke", () => {
    const revoked = revokeConnection(connection());
    expect(revoked.status).toBe(EConnectionStatus.Revoked);
    expect(revoked.auth_ref).toBeNull();
    expect(canUseConnection(revoked)).toBe(false);
  });

  it("distinguishes revoke from delete", () => {
    const revoked = revokeConnection(connection());
    const deleting = beginDelete(revoked);
    expect(deleting.status).toBe(EConnectionStatus.Deleting);
    const deleted = finishDelete(deleting);
    expect(deleted.status).toBe(EConnectionStatus.Deleted);
    expect(deleted.deleted_at).toBeTruthy();
  });
});

describe("sanitizeConnectionForClient", () => {
  it("strips credential-shaped fields", () => {
    const clean = sanitizeConnectionForClient({
      id: "c1",
      access_token: "secret",
      refresh_token: "secret2",
      auth_ref: "sm://x",
    });
    expect(clean.access_token).toBeUndefined();
    expect(clean.refresh_token).toBeUndefined();
    expect(clean.auth_ref).toBe("sm://x");
  });
});

describe("validateCallbackState", () => {
  const request: IConnectionRequest = {
    id: "req-1",
    workspace_slug: "acme",
    connector_key: "github",
    connector_version: 1,
    scope: EConnectionScope.Workspace,
    container_id: null,
    connection_id: "conn-1",
  requested_capabilities: ["repos.read"],
    state: "state-abc",
    pkce_challenge: "challenge",
    status: EConnectionStatus.Authorizing,
    created_at: "2026-07-26T00:00:00.000Z",
    expires_at: "2099-01-01T00:00:00.000Z",
  };

  it("rejects CSRF/state mismatch", () => {
    expect(() => validateCallbackState(request, "wrong")).toThrow(/state mismatch/i);
  });

  it("accepts matching state", () => {
    expect(() => validateCallbackState(request, "state-abc")).not.toThrow();
  });
});

describe("assertSameWorkspace", () => {
  it("blocks cross-workspace rebind", () => {
    expect(() => assertSameWorkspace(connection(), "other")).toThrow(/workspaces/i);
  });
});

describe("applyStatus", () => {
  it("rejects illegal transitions", () => {
    expect(() =>
      applyStatus(connection({ status: EConnectionStatus.Deleted }), EConnectionStatus.Connected),
    ).toThrow(/Invalid connection transition/);
  });
});
