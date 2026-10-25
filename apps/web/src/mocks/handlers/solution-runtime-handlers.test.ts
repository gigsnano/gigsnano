import { beforeEach, describe, expect, it } from "vitest";

import { resolveMock } from "@/mocks";
import { resetSolutionRuntimeMocks } from "@/mocks/data/solution-runtime";
import type { IAnalysisJob } from "@/types/solution/analysis";
import {
  EConnectionStatus,
  type IConnection,
  type IConnectionRequest,
} from "@/types/solution/connection";

describe("solution runtime mock handlers", () => {
  beforeEach(() => {
    resetSolutionRuntimeMocks();
  });

  it("starts an analysis job and advances on poll", async () => {
    const started = await resolveMock<IAnalysisJob>(
      "POST",
      "/workspaces/acme/analysis-jobs/",
      { setup_draft_id: "draft-1", sources: [] },
    );
    expect(started.setup_draft_id).toBe("draft-1");
    expect(started.inferences.every((i) => i.source.ref)).toBe(true);

    const polled = await resolveMock<IAnalysisJob>(
      "GET",
      `/workspaces/acme/analysis-jobs/${started.id}/`,
    );
    expect(polled.ratio).toBeGreaterThanOrEqual(started.ratio);
  });

  it("retries without duplicating completed artifacts", async () => {
    const started = await resolveMock<IAnalysisJob>(
      "POST",
      "/workspaces/acme/analysis-jobs/",
      { setup_draft_id: "draft-1", sources: [] },
    );
    // Drive to partial/completed
    await resolveMock("GET", `/workspaces/acme/analysis-jobs/${started.id}/`);
    await resolveMock("GET", `/workspaces/acme/analysis-jobs/${started.id}/`);
    const before = await resolveMock<IAnalysisJob>(
      "GET",
      `/workspaces/acme/analysis-jobs/${started.id}/`,
    );
    const completed = before.sub_results.find((s) => s.artifact_id);
    const retried = await resolveMock<IAnalysisJob>(
      "POST",
      `/workspaces/acme/analysis-jobs/${started.id}/retry/`,
      {},
    );
    const same = retried.sub_results.find((s) => s.key === completed?.key);
    expect(same?.artifact_id).toBe(completed?.artifact_id);
  });

  it("cancels and cleans temp files", async () => {
    const started = await resolveMock<IAnalysisJob>(
      "POST",
      "/workspaces/acme/analysis-jobs/",
      { setup_draft_id: "draft-1", sources: [] },
    );
    const cancelled = await resolveMock<IAnalysisJob>(
      "POST",
      `/workspaces/acme/analysis-jobs/${started.id}/cancel/`,
      {},
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.temp_files_cleaned).toBe(true);
  });

  it("authorizes a connection without returning credentials", async () => {
    const req = await resolveMock<IConnectionRequest>(
      "POST",
      "/workspaces/acme/setup-connections/request/",
      {
        connector_key: "github",
        connector_version: 1,
        scope: "workspace",
        requested_capabilities: ["repos.read"],
        read_only: true,
      },
    );
    expect(req.state).toBeTruthy();
    const connected = await resolveMock<IConnection>(
      "POST",
      `/workspaces/acme/setup-connections/${req.connection_id}/callback/`,
      {
        state: req.state,
        idempotency_key: "idem-1",
        provider_account: "acme",
        provider_tenant: "t1",
      },
    );
    expect(connected.status).toBe(EConnectionStatus.Connected);
    expect(connected.auth_ref).toMatch(/^sm:\/\//);
    expect(
      Object.keys(connected as unknown as Record<string, unknown>).some((k) =>
        /token|secret|password/i.test(k),
      ),
    ).toBe(false);

    // Duplicate callback is idempotent
    const again = await resolveMock<IConnection>(
      "POST",
      `/workspaces/acme/setup-connections/${req.connection_id}/callback/`,
      {
        state: req.state,
        idempotency_key: "idem-1",
        provider_account: "acme",
        provider_tenant: "t1",
      },
    );
    expect(again.id).toBe(connected.id);
  });

  it("rejects CSRF state mismatch", async () => {
    const req = await resolveMock<IConnectionRequest>(
      "POST",
      "/workspaces/acme/setup-connections/request/",
      {
        connector_key: "github",
        connector_version: 1,
        scope: "workspace",
        requested_capabilities: ["repos.read"],
      },
    );
    await expect(
      resolveMock("POST", `/workspaces/acme/setup-connections/${req.connection_id}/callback/`, {
        state: "wrong",
        idempotency_key: "idem-2",
      }),
    ).rejects.toThrow(/state/i);
  });
});
