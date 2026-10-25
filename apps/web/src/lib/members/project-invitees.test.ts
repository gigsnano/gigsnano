import { describe, expect, it } from "vitest";

import {
  EInvitationStatus,
  EProjectRole,
  EWorkspaceRole,
  type IWorkspaceInvitation,
} from "@/types";

import { grantedProjectIds, pendingProjectInvitees, safeProjectRole } from "./project-invitees";

function invitation(over: Partial<IWorkspaceInvitation> = {}): IWorkspaceInvitation {
  return {
    id: "inv_1",
    workspace_slug: "acme",
    email: "grace@example.test",
    role: EWorkspaceRole.Member,
    invited_by_name: "Ada",
    created_at: "2026-08-01T09:00:00Z",
    status: EInvitationStatus.Pending,
    expires_at: "2026-08-08T09:00:00Z",
    last_sent_at: null,
    accepted_at: null,
    resend_count: 0,
    project_grants: [],
    ...over,
  };
}

describe("pendingProjectInvitees", () => {
  it("returns only invitees granted this project", () => {
    const rows = pendingProjectInvitees(
      [
        invitation({ project_grants: [{ project_id: "p1", role: EProjectRole.Admin }] }),
        invitation({ id: "inv_2", email: "b@x.io", project_grants: [{ project_id: "p2", role: EProjectRole.Member }] }),
        invitation({ id: "inv_3", email: "c@x.io" }),
      ],
      "p1",
    );
    expect(rows).toEqual([
      { invitation_id: "inv_1", email: "grace@example.test", role: EProjectRole.Admin },
    ]);
  });

  it("skips settled invitations — an accepted one is already a real member", () => {
    for (const status of [
      EInvitationStatus.Accepted,
      EInvitationStatus.Revoked,
      EInvitationStatus.Expired,
      EInvitationStatus.DeliveryFailed,
    ]) {
      const rows = pendingProjectInvitees(
        [invitation({ status, project_grants: [{ project_id: "p1", role: EProjectRole.Member }] })],
        "p1",
      );
      expect(rows).toEqual([]);
    }
  });

  it("tolerates a missing list and a row from before the field existed", () => {
    expect(pendingProjectInvitees(undefined, "p1")).toEqual([]);
    const legacy = invitation();
    delete (legacy as Partial<IWorkspaceInvitation>).project_grants;
    expect(pendingProjectInvitees([legacy], "p1")).toEqual([]);
  });
});

describe("grantedProjectIds", () => {
  it("finds the live invitation's grants, case-insensitively", () => {
    const rows = [
      invitation({ project_grants: [{ project_id: "p1", role: EProjectRole.Member }] }),
      invitation({ id: "inv_old", status: EInvitationStatus.Revoked, project_grants: [{ project_id: "p9", role: EProjectRole.Member }] }),
    ];
    expect(grantedProjectIds(rows, "GRACE@example.test")).toEqual(["p1"]);
  });

  it("is empty for an address with no live invitation", () => {
    expect(grantedProjectIds([invitation()], "nobody@x.io")).toEqual([]);
  });
});

describe("safeProjectRole", () => {
  it("passes through a known role and falls back otherwise", () => {
    expect(safeProjectRole("admin")).toBe(EProjectRole.Admin);
    expect(safeProjectRole("wizard")).toBe(EProjectRole.Member);
  });
});
