import { describe, expect, it } from "vitest";

import { EMemberStatus, EWorkspaceRole, type IWorkspaceMember } from "@/types";

import { projectMemberCandidates } from "./project-member-candidates";

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

describe("projectMemberCandidates", () => {
  it("offers active workspace members", () => {
    expect(projectMemberCandidates([member({})], new Set())).toEqual([
      {
        user_id: "u1",
        display_name: "Alan Turing",
        email: "alan@example.test",
        avatar_url: null,
        invited: false,
      },
    ]);
  });

  it("offers a member who is still in the invited state (GIN-528)", () => {
    const [candidate] = projectMemberCandidates(
      [member({ status: EMemberStatus.Pending })],
      new Set(),
    );
    expect(candidate).toMatchObject({ user_id: "u1", invited: true });
  });

  it("excludes anyone already on the project", () => {
    expect(projectMemberCandidates([member({})], new Set(["u1"]))).toEqual([]);
  });

  it("excludes an email invitation with no account behind it", () => {
    // The members list stands these rows in for WorkspaceInvitation records,
    // which carry no user_id — there is no user to attach to a project yet.
    const rows = [member({ status: EMemberStatus.Pending, user_id: "", email: "new@example.test" })];
    expect(projectMemberCandidates(rows, new Set())).toEqual([]);
  });

  it("keeps active members ahead of invited ones", () => {
    const rows = [
      member({ id: "m1", user_id: "u1", status: EMemberStatus.Pending }),
      member({ id: "m2", user_id: "u2", status: EMemberStatus.Active }),
    ];
    expect(projectMemberCandidates(rows, new Set()).map((c) => c.user_id)).toEqual(["u2", "u1"]);
  });
});
