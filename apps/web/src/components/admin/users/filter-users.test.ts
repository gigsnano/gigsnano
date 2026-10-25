import { describe, expect, it } from "vitest";

import type { IPlatformUser } from "@/types";

import { filterPlatformUsers } from "./filter-users";

const USERS: IPlatformUser[] = [
  {
    id: "1",
    display_name: "Ada Lovelace",
    email: "ada@test.io",
    avatar_url: null,
    is_suspended: false,
    suspended_at: null,
    auth_provider: "google",
    workspace_count: 2,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    display_name: "Alan Turing",
    email: "alan@test.io",
    avatar_url: null,
    is_suspended: true,
    suspended_at: "2026-06-01T00:00:00Z",
    auth_provider: "password",
    workspace_count: 1,
    created_at: "2026-01-02T00:00:00Z",
  },
];

describe("filterPlatformUsers", () => {
  it("filters by query on name and email", () => {
    expect(filterPlatformUsers(USERS, { q: "ada" })).toHaveLength(1);
    expect(filterPlatformUsers(USERS, { q: "alan@test" })).toHaveLength(1);
  });

  it("filters by status", () => {
    expect(filterPlatformUsers(USERS, { status: "suspended" })).toHaveLength(1);
    expect(filterPlatformUsers(USERS, { status: "active" })).toHaveLength(1);
  });
});
