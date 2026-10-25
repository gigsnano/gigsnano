import { describe, expect, it } from "vitest";

import {
  ESolutionAvailability,
  ESolutionCapability,
  ESolutionKey,
  type ISolutionDefinition,
} from "@/types";

import {
  authorizeContainerSegment,
  composeContainerNavigation,
  REVENUE_ASSURANCE_ONLY_SEGMENTS,
  SOFTWARE_DELIVERY_ONLY_SEGMENTS,
} from "./compose-navigation";
import { projectPanelRoutes } from "@/lib/nav/project-panel-routes";

function makeSoftwareDelivery(): ISolutionDefinition {
  return {
    key: ESolutionKey.SoftwareDelivery,
    version: 1,
    name: "Software Delivery",
    outcome: "…",
    description: "…",
    container_noun: "project",
    capabilities: [
      ESolutionCapability.Journeys,
      ESolutionCapability.Repositories,
      ESolutionCapability.DomainObjects,
    ],
    starting_points: [],
    navigation: [
      { key: "overview", label: "Overview", path: "", requires_capability: null },
      {
        key: "journey",
        label: "Journey",
        path: "journey",
        requires_capability: ESolutionCapability.Journeys,
      },
      { key: "work-items", label: "Work items", path: "issues", requires_capability: null },
      {
        key: "codebase",
        label: "Codebase",
        path: "codebase",
        requires_capability: ESolutionCapability.Repositories,
      },
    ],
    availability: ESolutionAvailability.Available,
    availability_reason: null,
  };
}

function makeRevenueAssurance(): ISolutionDefinition {
  return {
    key: ESolutionKey.RevenueAssurance,
    version: 1,
    name: "Revenue Assurance",
    outcome: "…",
    description: "…",
    container_noun: "assurance workspace",
    capabilities: [ESolutionCapability.DomainObjects, ESolutionCapability.Integrations],
    starting_points: [],
    navigation: [
      { key: "home", label: "Assurance Home", path: "", requires_capability: null },
      { key: "contracts", label: "Contracts", path: "contracts", requires_capability: null },
      { key: "exceptions", label: "Exceptions", path: "exceptions", requires_capability: null },
      {
        key: "evidence",
        label: "Evidence",
        path: "evidence",
        requires_capability: ESolutionCapability.Integrations,
      },
    ],
    availability: ESolutionAvailability.Available,
    availability_reason: null,
  };
}

describe("composeContainerNavigation", () => {
  it("keeps Software Delivery project URLs stable", () => {
    const routes = composeContainerNavigation("acme", "prj_1", makeSoftwareDelivery());
    expect(routes.find((r) => r.label === "Overview")?.path).toBe("/acme/projects/prj_1");
    expect(routes.find((r) => r.label === "Work items")?.path).toBe(
      "/acme/projects/prj_1/issues",
    );
  });

  it("appends Pages + Meetings and keeps off-rail SD routes out of Rail B", () => {
    const solution = makeSoftwareDelivery();
    solution.navigation.push(
      { key: "views", label: "Views", path: "views", requires_capability: null },
      { key: "repository", label: "Repository", path: "repository", requires_capability: null },
    );
    const routes = composeContainerNavigation("acme", "prj_1", solution);
    const labels = routes.map((r) => r.label);
    expect(labels).toEqual(["Overview", "Work items", "Pages", "Meetings", "Codebase"]);
    for (const gone of ["Journey", "Views", "Repository", "Document import", "Foundation"]) {
      expect(labels).not.toContain(gone);
    }
  });

  it("renders SD rows in the same order as the fallback list, whatever the definition order", () => {
    const solution = makeSoftwareDelivery();
    solution.navigation.push(
      { key: "cycles", label: "Cycles", path: "cycles", requires_capability: null },
      { key: "modules", label: "Modules", path: "modules", requires_capability: null },
    );
    const labels = composeContainerNavigation("acme", "prj_1", solution).map((r) => r.label);
    expect(labels).toEqual(projectPanelRoutes("acme", "prj_1").map((r) => r.label));
  });

  it("gives the SD Overview route its Journey/Views tab prefixes", () => {
    const routes = composeContainerNavigation("acme", "prj_1", makeSoftwareDelivery());
    expect(routes[0].activePrefixes).toEqual([
      "/acme/projects/prj_1/journey",
      "/acme/projects/prj_1/views",
    ]);
  });

  it("leaves Revenue Assurance routes untouched", () => {
    const routes = composeContainerNavigation("acme", "ra_1", makeRevenueAssurance());
    expect(routes.map((r) => r.label)).toEqual([
      "Assurance Home",
      "Contracts",
      "Exceptions",
      "Evidence",
    ]);
    expect(routes[0].activePrefixes).toBeUndefined();
  });

  it("never surfaces repository or journey on a Revenue Assurance container", () => {
    const routes = composeContainerNavigation("acme", "ra_1", makeRevenueAssurance());
    const paths = routes.map((r) => r.path);
    expect(paths.some((p) => p.endsWith("/repository"))).toBe(false);
    expect(paths.some((p) => p.endsWith("/journey"))).toBe(false);
    expect(paths.some((p) => p.endsWith("/codebase"))).toBe(false);
    expect(routes.map((r) => r.label)).toEqual(
      expect.arrayContaining(["Assurance Home", "Contracts", "Exceptions", "Evidence"]),
    );
  });

  it("drops capability-gated entries the solution does not have", () => {
    const solution = makeRevenueAssurance();
    solution.capabilities = [ESolutionCapability.DomainObjects]; // no Integrations
    const routes = composeContainerNavigation("acme", "ra_1", solution);
    expect(routes.map((r) => r.label)).not.toContain("Evidence");
  });
});

describe("authorizeContainerSegment", () => {
  it("lets Software Delivery members keep current access", () => {
    expect(authorizeContainerSegment(ESolutionKey.SoftwareDelivery, null)).toBe("allow");
    expect(authorizeContainerSegment(ESolutionKey.SoftwareDelivery, "issues")).toBe("allow");
    expect(authorizeContainerSegment(ESolutionKey.SoftwareDelivery, "repository")).toBe("allow");
  });

  it("forbids a Revenue Assurance user from repository/release routes", () => {
    for (const segment of SOFTWARE_DELIVERY_ONLY_SEGMENTS) {
      expect(authorizeContainerSegment(ESolutionKey.RevenueAssurance, segment)).toBe("forbid");
    }
  });

  it("forbids a Software Delivery user from assurance-only routes", () => {
    for (const segment of REVENUE_ASSURANCE_ONLY_SEGMENTS) {
      expect(authorizeContainerSegment(ESolutionKey.SoftwareDelivery, segment)).toBe("forbid");
    }
  });

  it("allows Revenue Assurance domain segments", () => {
    expect(authorizeContainerSegment(ESolutionKey.RevenueAssurance, "contracts")).toBe("allow");
    expect(authorizeContainerSegment(ESolutionKey.RevenueAssurance, "exceptions")).toBe("allow");
  });
});
