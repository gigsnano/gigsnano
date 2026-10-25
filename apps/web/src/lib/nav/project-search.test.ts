import { describe, it, expect } from "vitest";

import { filterProjectsByQuery } from "./project-search";
import { ECloneStatus, EIndexStatus, EProjectFlow, ESprintZeroStatus, type IProject } from "@/types";

function makeProject(overrides: Partial<IProject>): IProject {
  return {
    id: "p1",
    workspace_slug: "acme",
    name: "Alpha",
    identifier: "ALP",
    cover_image_url: "",
    logo_emoji: null,
    logo_color: null,
    logo_image_url: null,
    start_date: "2026-01-01",
    target_date: "2026-06-01",
    description: "",
    overview: "",
    lead_id: null,
    member_count: 0,
    members: [],
    flow: EProjectFlow.Fresh,
    has_ui: true,
    planning_method: "automatic",
    planning_method_updated_at: null,
    sprint_zero_status: ESprintZeroStatus.NotStarted,
    sprint_zero_progress: 0,
    repo_full_name: null,
    repo_default_branch: null,
    clone_status: ECloneStatus.None,
    clone_error: null,
    index_status: EIndexStatus.None,
    index_error: null,
    indexed_commit_sha: null,
    indexed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("filterProjectsByQuery", () => {
  const projects = [
    makeProject({ id: "p1", name: "Personal Finance", identifier: "PFT" }),
    makeProject({ id: "p2", name: "Git Integration", identifier: "GIT" }),
  ];

  it("returns all projects when query is empty", () => {
    expect(filterProjectsByQuery(projects, "")).toHaveLength(2);
  });

  it("filters by name", () => {
    expect(filterProjectsByQuery(projects, "finance")).toHaveLength(1);
  });

  it("filters by identifier", () => {
    expect(filterProjectsByQuery(projects, "git")).toHaveLength(1);
  });
});
