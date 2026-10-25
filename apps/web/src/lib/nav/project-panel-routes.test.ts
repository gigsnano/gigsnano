import { describe, it, expect } from "vitest";

import {
  activeProjectIdFromPath,
  firstSegmentAfter,
  isProjectPanelRouteActive,
  projectPanelRoutes,
} from "./project-panel-routes";

describe("activeProjectIdFromPath", () => {
  const slug = "acme";

  it("returns the project id on overview", () => {
    expect(activeProjectIdFromPath("/acme/projects/p1", slug)).toBe("p1");
  });

  it("returns the project id on nested routes", () => {
    expect(activeProjectIdFromPath("/acme/projects/p1/issues", slug)).toBe("p1");
  });

  it("returns null outside project routes", () => {
    expect(activeProjectIdFromPath("/acme/projects", slug)).toBeNull();
    expect(activeProjectIdFromPath("/acme/projects/", slug)).toBeNull();
    expect(activeProjectIdFromPath("/acme/home", slug)).toBeNull();
  });

  it("treats a slug with regex metacharacters literally (GIN-257 ReDoS fix)", () => {
    // Old dynamic RegExp: "a.c" would match "/aXc/projects/p1"; string ops don't.
    expect(activeProjectIdFromPath("/aXc/projects/p1", "a.c")).toBeNull();
    expect(activeProjectIdFromPath("/a.c/projects/p1", "a.c")).toBe("p1");
  });
});

describe("firstSegmentAfter", () => {
  it("extracts the first segment after the prefix", () => {
    expect(firstSegmentAfter("/acme/settings/projects/p9/labels", "/acme/settings/projects/")).toBe("p9");
  });

  it("returns null when the prefix is absent or nothing follows", () => {
    expect(firstSegmentAfter("/acme/home", "/acme/settings/projects/")).toBeNull();
    expect(firstSegmentAfter("/acme/settings/projects/", "/acme/settings/projects/")).toBeNull();
  });
});

describe("projectPanelRoutes", () => {
  it("lists the seven Software Delivery rail routes in order", () => {
    const labels = projectPanelRoutes("acme", "p1").map((r) => r.label);
    expect(labels).toEqual([
      "Overview",
      "Work items",
      "Cycles",
      "Modules",
      "Pages",
      "Meetings",
      "Codebase",
    ]);
  });

  it("keeps Codebase on its project URL", () => {
    const codebase = projectPanelRoutes("acme", "p1").find((r) => r.label === "Codebase")!;
    expect(codebase.path).toBe("/acme/projects/p1/codebase");
    expect(isProjectPanelRouteActive("/acme/projects/p1/codebase/bundles", codebase)).toBe(true);
  });

  it("lights Overview for its Journey and Views tabs", () => {
    const overview = projectPanelRoutes("acme", "p1")[0];
    expect(isProjectPanelRouteActive("/acme/projects/p1", overview)).toBe(true);
    expect(isProjectPanelRouteActive("/acme/projects/p1/journey", overview)).toBe(true);
    expect(isProjectPanelRouteActive("/acme/projects/p1/journey/step-2", overview)).toBe(true);
    expect(isProjectPanelRouteActive("/acme/projects/p1/views/v1", overview)).toBe(true);
    expect(isProjectPanelRouteActive("/acme/projects/p1/issues", overview)).toBe(false);
    // Prefix match is segment-aware: "/viewsx" is not "/views".
    expect(isProjectPanelRouteActive("/acme/projects/p1/viewsx", overview)).toBe(false);
  });
});
