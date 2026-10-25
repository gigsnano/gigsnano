import { describe, expect, it } from "vitest";

import { isViewOwner, shareScopeLabel } from "@/lib/views/view-sharing";
import { EViewLayout, EViewShareScope, type IProjectView } from "@/types";

function view(overrides: Partial<IProjectView> = {}): IProjectView {
  return {
    id: "view_1",
    workspace_slug: "acme",
    project_id: "prj_1",
    name: "Mine",
    description: "",
    layout: EViewLayout.List,
    filter_query: "",
    owner_id: "u_1",
    owner_name: "Ada Lovelace",
    share_scope: EViewShareScope.Private,
    is_favorite: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

describe("view-sharing helpers", () => {
  it("detects ownership by owner_id", () => {
    expect(isViewOwner(view(), "u_1")).toBe(true);
    expect(isViewOwner(view(), "u_2")).toBe(false);
    expect(isViewOwner(view(), undefined)).toBe(false);
  });

  it("labels share scopes for the panel", () => {
    expect(shareScopeLabel(EViewShareScope.Private)).toBe("Private");
    expect(shareScopeLabel(EViewShareScope.Project)).toBe("Project");
  });
});
