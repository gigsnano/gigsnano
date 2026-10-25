import { afterEach, describe, expect, it, vi } from "vitest";

import { MOCK_SEGMENTS, shouldUseMock } from "./mock-fallback";

// vitest.config.ts forces NEXT_PUBLIC_USE_MOCKS="false" (mocks globally OFF), so
// `shouldUseMock` here exercises the covered-vs-denylisted routing, not the global short-circuit.
describe("shouldUseMock (with mocks globally OFF)", () => {
  it("no longer forces billing to the mock layer", () => {
    expect(MOCK_SEGMENTS).not.toContain("billing");
  });

  it("routes covered domains to the REAL api", () => {
    for (const p of [
      "/auth/me/",
      "/auth/me/pending-invites/",
      "/auth/mobile/handoff/",
      "/workspaces/",
      "/workspaces/acme/",
      "/workspaces/acme/members/",
      "/workspaces/acme/projects/",
      "/workspaces/acme/projects/p1/",
      "/workspaces/acme/projects/p1/cycles/c1/progress/",
      "/workspaces/acme/projects/p1/stories/s1/sub-stories/",
      "/workspaces/acme/documents/",
      "/workspaces/acme/github/",
      "/workspaces/acme/projects/p1/sync/",
      "/users/",
      "/users/u1/",
      "/workspaces/acme/projects/p1/labels/",
      "/workspaces/acme/projects/p1/states/",
      "/workspaces/acme/projects/p1/features/f1/",
      "/workspaces/acme/projects/p1/estimates/",
      "/workspaces/acme/projects/p1/automations/",
      "/workspaces/acme/projects/p1/views/",
      "/workspaces/acme/workspace-views/",
      "/workspaces/acme/projects/p1/pages/",
      "/workspaces/acme/stickies/",
      "/workspaces/acme/notifications/",
      "/workspaces/acme/analytics/",
      "/workspaces/acme/agents/",
      "/workspaces/acme/webhooks/",
      "/workspaces/acme/webhooks/wh1/",
      "/marketplace/jobs/",
      "/marketplace/jobs/mj-1/",
      "/marketplace/talent/",
      "/marketplace/talent/mf-1/",
      "/admin/me/",
      "/admin/privileges/",
      "/admin/roles/",
      "/admin/staff/",
      "/admin/audit-logs/",
      "/admin/llm-usage/summary/",
      "/admin/llm-usage/timeseries/",
      "/admin/llm-usage/heatmap-daily/",
      "/admin/llm-usage/heatmap-hourly/",
      "/admin/llm-usage/matrix/",
      "/admin/llm-usage/by-workspace/",
      "/admin/llm-usage/by-user/",
      "/admin/llm-usage/events/",
      "/admin/notification-templates/",
      "/admin/notification-templates/story.assigned/",
    ]) {
      expect(shouldUseMock("GET", p), p).toBe(false);
    }
  });

  it("force-mocks only the solution platform domains that have no backend yet", () => {
    expect(MOCK_SEGMENTS).toEqual(["analysis-jobs", "setup-connections"]);
    // integrations is now the real GitHub connection — no mock segment
    expect(shouldUseMock("GET", "/workspaces/acme/integrations/")).toBe(false);
  });

  it("routes solutions registry + setup drafts to the REAL api (GIN-443/GIN-446 live)", () => {
    expect(shouldUseMock("GET", "/workspaces/acme/solutions/")).toBe(false);
    expect(shouldUseMock("GET", "/workspaces/acme/setup-drafts/")).toBe(false);
    expect(shouldUseMock("POST", "/workspaces/acme/setup-drafts/")).toBe(false);
    expect(shouldUseMock("PATCH", "/workspaces/acme/setup-drafts/draft_1/")).toBe(false);
    expect(shouldUseMock("DELETE", "/workspaces/acme/setup-drafts/draft_1/")).toBe(false);
  });

  it("keeps analysis jobs + setup connections on mocks", () => {
    expect(shouldUseMock("GET", "/workspaces/acme/analysis-jobs/job_1/")).toBe(true);
    expect(shouldUseMock("POST", "/workspaces/acme/setup-connections/request/")).toBe(true);
  });

  it("does not let the solution segments swallow neighbouring project paths", () => {
    expect(shouldUseMock("GET", "/workspaces/acme/projects/")).toBe(false);
    expect(shouldUseMock("GET", "/workspaces/acme/solutions-archive/")).toBe(false);
  });

  it("routes forgot/reset-password to the REAL api", () => {
    expect(shouldUseMock("POST", "/auth/forgot-password/")).toBe(false);
    expect(shouldUseMock("POST", "/auth/reset-password/")).toBe(false);
  });

  it("routes billing wallet to the REAL api", () => {
    expect(shouldUseMock("GET", "/workspaces/acme/billing/wallet/")).toBe(false);
    expect(shouldUseMock("POST", "/workspaces/acme/billing/topup/")).toBe(false);
    expect(shouldUseMock("GET", "/billing/connect/status/")).toBe(false);
  });

  it("routes subscription + checkout + portal to the REAL api (backend shipped)", () => {
    expect(shouldUseMock("GET", "/workspaces/acme/billing/subscription/")).toBe(false);
    expect(shouldUseMock("POST", "/workspaces/acme/billing/checkout/")).toBe(false);
    expect(shouldUseMock("POST", "/workspaces/acme/billing/portal/")).toBe(false);
    // sibling billing endpoints remain live too
    expect(shouldUseMock("GET", "/workspaces/acme/billing/wallet/")).toBe(false);
    expect(shouldUseMock("POST", "/workspaces/acme/billing/topup/")).toBe(false);
  });

  it("routes exports to the REAL api (backend endpoint shipped)", () => {
    expect(shouldUseMock("GET", "/workspaces/acme/exports/")).toBe(false);
    expect(shouldUseMock("POST", "/workspaces/acme/exports/")).toBe(false);
  });

  it("routes account update + change-password to the REAL api", () => {
    expect(shouldUseMock("GET", "/auth/me/")).toBe(false);
    expect(shouldUseMock("PATCH", "/auth/me/")).toBe(false);
    expect(shouldUseMock("POST", "/auth/change-password/")).toBe(false);
  });

  it("routes personal access tokens to the REAL api (backend endpoint shipped)", () => {
    expect(shouldUseMock("GET", "/auth/tokens/")).toBe(false);
    expect(shouldUseMock("POST", "/auth/tokens/")).toBe(false);
    expect(shouldUseMock("DELETE", "/auth/tokens/pat_1/")).toBe(false);
  });

  it("does not confuse /views/ with /workspace-views/ or covered paths", () => {
    expect(shouldUseMock("GET", "/workspaces/acme/workspace-views/")).toBe(false);
    expect(shouldUseMock("GET", "/workspaces/acme/projects/p1/views/v1/")).toBe(false);
    expect(shouldUseMock("GET", "/workspaces/acme/projects/p1/stories/")).toBe(false);
    expect(shouldUseMock("GET", "/workspaces/acme/projects/p1/activity/")).toBe(false);
  });

  it("keeps github repos + clone retry on the real API when mocks off", () => {
    expect(shouldUseMock("GET", "/workspaces/acme/github/repos/")).toBe(false);
    expect(shouldUseMock("POST", "/workspaces/acme/projects/p1/clone/retry/")).toBe(false);
  });

  it("routes notification template admin CRUD to the REAL api", () => {
    expect(shouldUseMock("PATCH", "/admin/notification-templates/story.assigned/")).toBe(false);
    expect(
      shouldUseMock("POST", "/admin/notification-templates/story.assigned/reset/"),
    ).toBe(false);
  });
});

describe("thread + story-document routes (now live on gigsnano-api)", () => {
  it("routes finalize-description to the REAL api (backend endpoint shipped)", () => {
    const p = "/workspaces/acme/projects/p1/stories/s1/thread/finalize-description/";
    expect(shouldUseMock("POST", p)).toBe(false);
  });
  it("does not force-mock the live streaming messages endpoint", () => {
    const p = "/workspaces/acme/projects/p1/stories/s1/thread/messages/";
    expect(shouldUseMock("POST", p)).toBe(false);
  });
  it("routes story documents to the REAL api for all methods (list + upload live)", () => {
    const p = "/workspaces/acme/projects/p1/stories/s1/documents/";
    expect(shouldUseMock("GET", p)).toBe(false);
    expect(shouldUseMock("POST", p)).toBe(false);
  });
  it("routes document DELETE to the REAL api (backend endpoint shipped)", () => {
    expect(shouldUseMock("DELETE", "/workspaces/acme/documents/d1/")).toBe(false);
  });
  it("routes story sub-resources (links/relations/comments/history/subscribe) to the REAL api", () => {
    const b = "/workspaces/acme/projects/p1/stories/s1";
    for (const leaf of ["links", "relations", "comments", "history", "subscribe"]) {
      expect(shouldUseMock("GET", `${b}/${leaf}/`), leaf).toBe(false);
    }
  });
});

describe("agent delegation routes (live on gigsnano-api)", () => {
  it("routes connection endpoints to the REAL api", () => {
    expect(shouldUseMock("GET", "/agents/connections/")).toBe(false);
    expect(shouldUseMock("POST", "/agents/connections/cursor/install-url/")).toBe(false);
    expect(shouldUseMock("DELETE", "/agents/connections/agc_1/")).toBe(false);
    expect(shouldUseMock("POST", "/agents/oauth/callback/")).toBe(false);
  });
  it("routes delegation create/read/cancel/retry/stream to the REAL api", () => {
    const base = "/workspaces/acme/projects/p1";
    expect(shouldUseMock("POST", `${base}/stories/s1/delegations/`)).toBe(false);
    expect(shouldUseMock("GET", `${base}/delegations/del_1/`)).toBe(false);
    expect(shouldUseMock("POST", `${base}/delegations/del_1/cancel/`)).toBe(false);
    expect(shouldUseMock("POST", `${base}/delegations/del_1/retry/`)).toBe(false);
    expect(shouldUseMock("GET", `${base}/delegations/del_1/stream/`)).toBe(false);
  });
});

describe("ai-usage routing (workspace usage + thread usage now live)", () => {
  it("routes workspace usage + thread usage to the REAL api", () => {
    const base = "/workspaces/acme";
    expect(shouldUseMock("GET", `${base}/ai-usage/`)).toBe(false);
    expect(
      shouldUseMock("GET", `${base}/projects/p1/stories/s1/thread/th1/usage/`),
    ).toBe(false);
  });

  it("keeps the client-side cost estimate mocked (no backend)", () => {
    expect(shouldUseMock("POST", "/workspaces/acme/ai-usage/estimate/")).toBe(true);
  });
});

describe("USE_MOCKS default (env unset)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("defaults to real (no mock) in production when the flag is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { shouldUseMock: fn } = await import("./mock-fallback");
    expect(fn("GET", "/workspaces/acme/projects/")).toBe(false);
  });

  it("defaults to mocks in development when the flag is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { shouldUseMock: fn } = await import("./mock-fallback");
    expect(fn("GET", "/workspaces/acme/projects/")).toBe(true);
  });
});
