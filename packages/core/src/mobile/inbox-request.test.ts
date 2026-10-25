import { describe, expect, it } from "vitest";

import type { IInboxItem } from "../types/inbox";
import { inboxRequest } from "./inbox-request";

function item(over: Partial<IInboxItem>): IInboxItem {
  return {
    id: "i1", kind: "director_action", entity_id: "e1", project_id: "p1", project_name: "P",
    story_id: null, href: null, title: "t", subtitle: "s", created_at: "2026-01-01T00:00:00Z",
    actions: [], ...over,
  };
}

describe("inboxRequest", () => {
  it("approves and rejects a director action", () => {
    expect(inboxRequest("ws", item({}), "approve")).toEqual({
      method: "POST", path: "/workspaces/ws/projects/p1/director-actions/e1/approve/", body: { note: "" },
    });
    expect(inboxRequest("ws", item({}), "reject")?.path).toBe("/workspaces/ws/projects/p1/director-actions/e1/reject/");
  });
  it("approves and rejects a recovery plan", () => {
    const it1 = item({ kind: "recovery_plan" });
    expect(inboxRequest("ws", it1, "approve")).toEqual({
      method: "POST", path: "/workspaces/ws/projects/p1/recovery-plans/e1/approve/", body: {},
    });
    expect(inboxRequest("ws", it1, "reject")?.path).toBe("/workspaces/ws/projects/p1/recovery-plans/e1/reject/");
  });
  it("resolves an escalation", () => {
    expect(inboxRequest("ws", item({ kind: "escalation" }), "resolve")).toEqual({
      method: "POST", path: "/workspaces/ws/projects/p1/escalations/e1/resolve/", body: { resolution: "" },
    });
  });
  it("retries a delegation review", () => {
    expect(inboxRequest("ws", item({ kind: "delegation_review" }), "retry")).toEqual({
      method: "POST", path: "/workspaces/ws/projects/p1/delegations/e1/retry/", body: {},
    });
  });
  it("marks an assignment or mention notification read on open", () => {
    for (const kind of ["assignment", "mention"] as const) {
      expect(inboxRequest("ws", item({ kind, project_id: null }), "open")).toEqual({
        method: "PATCH", path: "/workspaces/ws/notifications/e1/", body: { read: true },
      });
    }
  });
  it("returns null for an unsupported pair", () => {
    expect(inboxRequest("ws", item({}), "resolve")).toBeNull();
    expect(inboxRequest("ws", item({ kind: "escalation" }), "approve")).toBeNull();
  });
  it("returns null when a project id is needed but missing", () => {
    expect(inboxRequest("ws", item({ project_id: null }), "approve")).toBeNull();
  });
});
