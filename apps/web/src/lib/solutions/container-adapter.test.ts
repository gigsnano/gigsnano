import { describe, expect, it } from "vitest";

import {
  EContainerLifecycle,
  ECloneStatus,
  EIndexStatus,
  EProjectFlow,
  ESolutionKey,
  ESprintZeroStatus,
  type IProject,
} from "@/types";

import {
  containerFromProject,
  isInferredContainer,
  normalizeProject,
  resolveProjectSolutionKey,
} from "./container-adapter";

function makeProject(overrides: Partial<IProject> = {}): IProject {
  return {
    id: "prj_1",
    workspace_slug: "acme",
    name: "Mobile Banking App",
    identifier: "MBA",
    cover_image_url: "https://example.test/cover.jpg",
    logo_emoji: "🏦",
    logo_color: null,
    logo_image_url: null,
    start_date: "2026-07-01",
    target_date: "2026-07-15",
    description: "…",
    overview: "<p>…</p>",
    lead_id: "usr_1",
    member_count: 3,
    members: [],
    flow: EProjectFlow.Existing,
    has_ui: true,
    planning_method: "automatic",
    planning_method_updated_at: null,
    sprint_zero_status: ESprintZeroStatus.Complete,
    sprint_zero_progress: 100,
    repo_full_name: "acme/banking",
    repo_default_branch: "main",
    clone_status: ECloneStatus.Ready,
    clone_error: null,
    index_status: EIndexStatus.Ready,
    index_error: null,
    indexed_commit_sha: "abc1234",
    indexed_at: "2026-07-02T00:00:00Z",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-02T00:00:00Z",
    ...overrides,
  };
}

describe("resolveProjectSolutionKey", () => {
  it("reads a project that predates the solution model as Software Delivery", () => {
    expect(resolveProjectSolutionKey(makeProject())).toBe(ESolutionKey.SoftwareDelivery);
  });

  it("honours an explicit key once the backend starts sending one", () => {
    const project = makeProject({ solution_key: ESolutionKey.RevenueAssurance });
    expect(resolveProjectSolutionKey(project)).toBe(ESolutionKey.RevenueAssurance);
  });
});

describe("containerFromProject", () => {
  it("preserves the project's id, so existing URLs keep resolving", () => {
    const project = makeProject();
    expect(containerFromProject(project).id).toBe(project.id);
  });

  it("adapts a project into an active container in the same workspace", () => {
    const container = containerFromProject(makeProject());
    expect(container).toMatchObject({
      workspace_slug: "acme",
      solution_key: ESolutionKey.SoftwareDelivery,
      display_name: "Mobile Banking App",
      lifecycle: EContainerLifecycle.Active,
      domain_ref: { kind: "project", id: "prj_1" },
    });
  });

  it("keeps software-only fields inside configuration, not on the contract", () => {
    const container = containerFromProject(makeProject());
    expect(container.configuration).toMatchObject({
      identifier: "MBA",
      has_ui: true,
      flow: EProjectFlow.Existing,
      repo_full_name: "acme/banking",
    });
    // A Revenue Assurance container must be expressible without these, so they
    // must not have leaked onto the container itself.
    expect(container).not.toHaveProperty("has_ui");
    expect(container).not.toHaveProperty("repo_full_name");
    expect(container).not.toHaveProperty("sprint_zero_status");
  });

  it("carries the project's timestamps through unchanged", () => {
    const container = containerFromProject(makeProject());
    expect(container.created_at).toBe("2026-07-01T00:00:00Z");
    expect(container.updated_at).toBe("2026-07-02T00:00:00Z");
  });
});

describe("normalizeProject", () => {
  it("is a no-op when the backend already sent a solution key", () => {
    const project = makeProject({
      solution_key: ESolutionKey.RevenueAssurance,
      solution_version: 2,
    });
    expect(normalizeProject(project)).toBe(project);
  });

  it("fills Software Delivery on a pre-solution row without changing its id", () => {
    const project = makeProject();
    const normalized = normalizeProject(project);
    expect(normalized.id).toBe(project.id);
    expect(normalized.solution_key).toBe(ESolutionKey.SoftwareDelivery);
    expect(normalized.solution_version).toBe(0);
  });
});
describe("isInferredContainer", () => {
  it("marks a container adapted from a pre-solution project row", () => {
    expect(isInferredContainer(containerFromProject(makeProject()))).toBe(true);
  });

  it("does not mark one the backend versioned explicitly", () => {
    const project = makeProject({ solution_version: 1 });
    expect(isInferredContainer(containerFromProject(project))).toBe(false);
  });
});
