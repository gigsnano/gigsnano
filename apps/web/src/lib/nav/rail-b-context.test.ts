import { describe, expect, it } from "vitest";

import { ESolutionKey } from "@/types";

import { railBContext, railBSwapDirection, switchProjectHref } from "./rail-b-context";

describe("railBContext", () => {
  it("is project inside any project route", () => {
    expect(railBContext("/acme/projects/p1", "acme")).toBe("project");
    expect(railBContext("/acme/projects/p1/issues/42", "acme")).toBe("project");
  });

  it("is workspace everywhere else", () => {
    expect(railBContext("/acme/projects", "acme")).toBe("workspace");
    expect(railBContext("/acme/home", "acme")).toBe("workspace");
    expect(railBContext("/acme/settings/projects/p1", "acme")).toBe("workspace");
  });
});

describe("railBSwapDirection", () => {
  it("goes forward into a project and back out of it", () => {
    expect(railBSwapDirection("workspace", "project")).toBe("forward");
    expect(railBSwapDirection("project", "workspace")).toBe("back");
  });

  it("is null when the context does not change", () => {
    expect(railBSwapDirection("project", "project")).toBeNull();
    expect(railBSwapDirection("workspace", "workspace")).toBeNull();
  });
});

describe("switchProjectHref", () => {
  it("lands on the target overview from the overview", () => {
    expect(switchProjectHref("/acme/projects/p1", "acme", "p1", "p2")).toBe("/acme/projects/p2");
  });

  it("keeps the section and drops ids from deep routes", () => {
    expect(switchProjectHref("/acme/projects/p1/issues/42", "acme", "p1", "p2")).toBe(
      "/acme/projects/p2/issues",
    );
    expect(switchProjectHref("/acme/projects/p1/views/v1", "acme", "p1", "p2")).toBe(
      "/acme/projects/p2/views",
    );
    expect(switchProjectHref("/acme/projects/p1/cycles/c1", "acme", "p1", "p2")).toBe(
      "/acme/projects/p2/cycles",
    );
  });

  it("falls back to the target overview when not inside the source project", () => {
    expect(switchProjectHref("/acme/home", "acme", "p1", "p2")).toBe("/acme/projects/p2");
  });

  it("drops a section the target's solution does not own", () => {
    // SD-only section into a Revenue Assurance container → its home, not a 403.
    expect(
      switchProjectHref("/acme/projects/p1/codebase", "acme", "p1", "ra1", ESolutionKey.RevenueAssurance),
    ).toBe("/acme/projects/ra1");
    // RA-only section into a Software Delivery project.
    expect(
      switchProjectHref("/acme/projects/ra1/contracts", "acme", "ra1", "p2", ESolutionKey.SoftwareDelivery),
    ).toBe("/acme/projects/p2");
  });

  it("keeps a section the target's solution shares", () => {
    expect(
      switchProjectHref("/acme/projects/p1/issues/7", "acme", "p1", "ra1", ESolutionKey.RevenueAssurance),
    ).toBe("/acme/projects/ra1/issues");
  });
});
