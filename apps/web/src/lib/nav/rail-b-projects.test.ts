import { describe, it, expect } from "vitest";

import { railBHiddenProjects, railBProjectRows } from "./rail-b-projects";
import { ECloneStatus, EIndexStatus, EProjectFlow, ESprintZeroStatus, type IProject } from "@/types";

function makeProject(id: string): IProject {
  return {
    id,
    workspace_slug: "acme",
    name: id,
    identifier: id.toUpperCase(),
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
  };
}

const projects = ["p1", "p2", "p3", "p4"].map(makeProject);

const base = { projects, limitProjects: false, projectLimit: 10, favorites: [] as string[] };

describe("railBProjectRows", () => {
  it("lists every project in order when unlimited and nothing is favorited", () => {
    const rows = railBProjectRows(base);
    expect(rows.map((r) => r.project.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(rows.every((r) => !r.favorite)).toBe(true);
  });

  it("pins favorites first, in project order, flagged as favorite", () => {
    const rows = railBProjectRows({ ...base, favorites: ["p4", "p2"] });
    expect(rows.map((r) => [r.project.id, r.favorite])).toEqual([
      ["p2", true],
      ["p4", true],
      ["p1", false],
      ["p3", false],
    ]);
  });

  it("does not count favorites against the limit", () => {
    const rows = railBProjectRows({ ...base, limitProjects: true, projectLimit: 1, favorites: ["p3"] });
    expect(rows.map((r) => r.project.id)).toEqual(["p3", "p1"]);
  });

  it("keeps all favorites visible when they exceed the limit", () => {
    const rows = railBProjectRows({
      ...base,
      limitProjects: true,
      projectLimit: 1,
      favorites: ["p1", "p2", "p3"],
    });
    // Three favorites + the first non-favorite.
    expect(rows.map((r) => r.project.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("ignores favorite ids that no longer match a project", () => {
    const rows = railBProjectRows({ ...base, favorites: ["gone", "p2"] });
    expect(rows.map((r) => r.project.id)).toEqual(["p2", "p1", "p3", "p4"]);
  });
});

describe("railBHiddenProjects", () => {
  it("returns nothing when unlimited", () => {
    expect(railBHiddenProjects(base)).toEqual([]);
  });

  it("returns exactly the non-favorite overflow", () => {
    const hidden = railBHiddenProjects({ ...base, limitProjects: true, projectLimit: 1, favorites: ["p3"] });
    expect(hidden.map((p) => p.id)).toEqual(["p2", "p4"]);
  });
});
