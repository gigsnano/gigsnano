import { describe, expect, it } from "vitest";

import { EMemberStatus, EWorkspaceRole, type IWorkspaceMember } from "@/types";

import { isWorkspaceAdmin, workspaceRoleOf } from "./workspace-role";

const member = (over: Partial<IWorkspaceMember>): IWorkspaceMember => ({
  id: "m1",
  workspace_slug: "acme",
  user_id: "u1",
  display_name: "Alan Turing",
  email: "alan@example.test",
  avatar_url: null,
  role: EWorkspaceRole.Member,
  status: EMemberStatus.Active,
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

describe("workspaceRoleOf", () => {
  it("reads the caller's own row, not someone else's", () => {
    const rows = [
      member({ id: "m1", user_id: "u1", role: EWorkspaceRole.Member }),
      member({ id: "m2", user_id: "u2", role: EWorkspaceRole.Owner }),
    ];
    expect(workspaceRoleOf(rows, "u1")).toBe(EWorkspaceRole.Member);
    expect(workspaceRoleOf(rows, "u2")).toBe(EWorkspaceRole.Owner);
  });

  // An invited-but-not-joined admin is not an admin yet: the server refuses
  // them, so counting the row would offer controls that 403 on use.
  it("ignores a row that isn't active", () => {
    const invited = [
      member({ role: EWorkspaceRole.Admin, status: EMemberStatus.Pending }),
    ];
    expect(workspaceRoleOf(invited, "u1")).toBeNull();
  });

  it("returns null for a non-member, an unloaded list, or no session", () => {
    const rows = [member({ role: EWorkspaceRole.Owner })];
    expect(workspaceRoleOf(rows, "stranger")).toBeNull();
    expect(workspaceRoleOf(undefined, "u1")).toBeNull();
    expect(workspaceRoleOf(rows, undefined)).toBeNull();
  });
});

describe("isWorkspaceAdmin", () => {
  it("admits admin and owner", () => {
    expect(isWorkspaceAdmin(EWorkspaceRole.Admin)).toBe(true);
    expect(isWorkspaceAdmin(EWorkspaceRole.Owner)).toBe(true);
  });

  // The regression this exists for: a plain member was shown Invite, role,
  // remove and Upgrade, and every one came back 403 as "please try again".
  it("refuses member, guest and unknown", () => {
    expect(isWorkspaceAdmin(EWorkspaceRole.Member)).toBe(false);
    expect(isWorkspaceAdmin(EWorkspaceRole.Guest)).toBe(false);
    expect(isWorkspaceAdmin(null)).toBe(false);
  });
});
