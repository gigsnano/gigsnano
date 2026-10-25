import { describe, expect, it } from "vitest";

import {
  ESolutionAvailability,
  ESolutionCapability,
  ESolutionKey,
  type ISetupDraft,
  type ISolutionDefinition,
  type ISolutionRegistry,
} from "@/types";

import {
  availableStartingPoints,
  findSolution,
  hasCapability,
  isDraftStale,
  isSolutionKey,
  isSolutionSelectable,
  parseSolutionKey,
  recommendedStartingPoint,
  resolveSelectableSolution,
  solutionNavigation,
  validateSolutionDefinition,
  validateSolutionRegistry,
} from "./registry";

function makeSolution(overrides: Partial<ISolutionDefinition> = {}): ISolutionDefinition {
  return {
    key: ESolutionKey.SoftwareDelivery,
    version: 1,
    name: "Software Delivery",
    outcome: "Build and operate production-ready software",
    description: "…",
    container_noun: "project",
    capabilities: [ESolutionCapability.Repositories, ESolutionCapability.Agents],
    starting_points: [
      { key: "idea", label: "Start from an idea", hint: "…", recommended: true, requires_capability: null },
      {
        key: "repository",
        label: "Connect a repository",
        hint: "…",
        recommended: false,
        requires_capability: ESolutionCapability.Repositories,
      },
    ],
    navigation: [
      { key: "overview", label: "Overview", path: "", requires_capability: null },
      {
        key: "codebase",
        label: "Codebase",
        path: "codebase",
        requires_capability: ESolutionCapability.Repositories,
      },
    ],
    availability: ESolutionAvailability.Available,
    availability_reason: null,
    ...overrides,
  };
}

const makeRegistry = (solutions: ISolutionDefinition[]): ISolutionRegistry => ({
  revision: "test.1",
  solutions,
});

describe("solution keys", () => {
  it("recognises the built-in keys", () => {
    expect(isSolutionKey("software_delivery")).toBe(true);
    expect(isSolutionKey("revenue_assurance")).toBe(true);
  });

  it("rejects a generic 'business' mode, which the platform deliberately has no key for", () => {
    expect(isSolutionKey("business")).toBe(false);
  });

  it("names the valid options when parsing an unknown key", () => {
    expect(() => parseSolutionKey("business")).toThrow(/Unknown solution "business"/);
    expect(() => parseSolutionKey("business")).toThrow(/software_delivery/);
  });
});

describe("resolveSelectableSolution", () => {
  it("returns an available solution", () => {
    const registry = makeRegistry([makeSolution()]);
    expect(resolveSelectableSolution(registry, ESolutionKey.SoftwareDelivery).key).toBe(
      ESolutionKey.SoftwareDelivery,
    );
  });

  it("refuses a disabled solution, surfacing the reason the user should see", () => {
    const registry = makeRegistry([
      makeSolution({
        availability: ESolutionAvailability.Disabled,
        availability_reason: "Revenue Assurance is in limited pilot.",
      }),
    ]);
    expect(() => resolveSelectableSolution(registry, ESolutionKey.SoftwareDelivery)).toThrow(
      "Revenue Assurance is in limited pilot.",
    );
  });

  it("refuses a solution the workspace does not carry at all", () => {
    const registry = makeRegistry([makeSolution()]);
    expect(() => resolveSelectableSolution(registry, ESolutionKey.RevenueAssurance)).toThrow(
      /not available in this workspace/,
    );
  });

  it("refuses an unknown key before it can reach the registry", () => {
    expect(() => resolveSelectableSolution(makeRegistry([]), "business")).toThrow(
      /Unknown solution/,
    );
  });
});

describe("capability gating", () => {
  it("hides starting points whose capability the solution lacks", () => {
    const withoutRepos = makeSolution({ capabilities: [ESolutionCapability.Agents] });
    expect(availableStartingPoints(withoutRepos).map((p) => p.key)).toEqual(["idea"]);
  });

  it("hides navigation entries whose capability the solution lacks", () => {
    const withoutRepos = makeSolution({ capabilities: [ESolutionCapability.Agents] });
    expect(solutionNavigation(withoutRepos).map((e) => e.key)).toEqual(["overview"]);
  });

  it("keeps capability-gated entries when the capability is present", () => {
    expect(solutionNavigation(makeSolution()).map((e) => e.key)).toEqual(["overview", "codebase"]);
  });

  it("reports individual capabilities", () => {
    expect(hasCapability(makeSolution(), ESolutionCapability.Repositories)).toBe(true);
    expect(hasCapability(makeSolution(), ESolutionCapability.Journeys)).toBe(false);
  });
});

describe("recommendedStartingPoint", () => {
  it("prefers the recommended one", () => {
    expect(recommendedStartingPoint(makeSolution())?.key).toBe("idea");
  });

  it("falls back to the first available when nothing is marked recommended", () => {
    const solution = makeSolution({
      starting_points: [
        { key: "import", label: "Import", hint: "…", recommended: false, requires_capability: null },
        { key: "blank", label: "Blank", hint: "…", recommended: false, requires_capability: null },
      ],
    });
    expect(recommendedStartingPoint(solution)?.key).toBe("import");
  });

  it("never recommends a starting point the solution cannot support", () => {
    const solution = makeSolution({
      capabilities: [],
      starting_points: [
        {
          key: "repository",
          label: "Connect a repository",
          hint: "…",
          recommended: true,
          requires_capability: ESolutionCapability.Repositories,
        },
        { key: "blank", label: "Blank", hint: "…", recommended: false, requires_capability: null },
      ],
    });
    expect(recommendedStartingPoint(solution)?.key).toBe("blank");
  });

  it("returns null when there is nothing to start", () => {
    expect(recommendedStartingPoint(makeSolution({ starting_points: [] }))).toBeNull();
  });
});

describe("isSolutionSelectable", () => {
  it.each([
    [ESolutionAvailability.Available, true],
    [ESolutionAvailability.Disabled, false],
    [ESolutionAvailability.RequiresPermission, false],
  ])("%s → %s", (availability, expected) => {
    const solution = makeSolution({
      availability,
      availability_reason: availability === ESolutionAvailability.Available ? null : "…",
    });
    expect(isSolutionSelectable(solution)).toBe(expected);
  });
});

describe("validateSolutionDefinition", () => {
  it("passes a well-formed definition", () => {
    expect(validateSolutionDefinition(makeSolution())).toEqual([]);
  });

  it("requires an integer version of at least 1, so drafts can detect staleness", () => {
    expect(validateSolutionDefinition(makeSolution({ version: 0 }))).toContainEqual(
      expect.stringContaining("integer version"),
    );
  });

  it("requires the copy the chooser card renders", () => {
    expect(validateSolutionDefinition(makeSolution({ outcome: "  " }))).toContainEqual(
      expect.stringContaining("missing outcome"),
    );
  });

  it("flags an unknown capability", () => {
    const solution = makeSolution({
      capabilities: ["teleportation" as ESolutionCapability],
    });
    expect(validateSolutionDefinition(solution)).toContainEqual(
      expect.stringContaining('unknown capability "teleportation"'),
    );
  });

  it("flags a solution whose every starting point is capability-gated away", () => {
    const solution = makeSolution({
      capabilities: [],
      starting_points: [
        {
          key: "repository",
          label: "Connect a repository",
          hint: "…",
          recommended: true,
          requires_capability: ESolutionCapability.Repositories,
        },
      ],
    });
    expect(validateSolutionDefinition(solution)).toContainEqual(
      expect.stringContaining("no startable entry point"),
    );
  });

  it("requires a reason whenever a solution is not available", () => {
    const solution = makeSolution({
      availability: ESolutionAvailability.Disabled,
      availability_reason: null,
    });
    expect(validateSolutionDefinition(solution)).toContainEqual(
      expect.stringContaining("no availability_reason"),
    );
  });

  it("flags duplicate starting-point and navigation keys", () => {
    const solution = makeSolution({
      starting_points: [
        { key: "idea", label: "A", hint: "…", recommended: true, requires_capability: null },
        { key: "idea", label: "B", hint: "…", recommended: false, requires_capability: null },
      ],
      navigation: [
        { key: "overview", label: "A", path: "", requires_capability: null },
        { key: "overview", label: "B", path: "b", requires_capability: null },
      ],
    });
    const problems = validateSolutionDefinition(solution);
    expect(problems).toContainEqual(expect.stringContaining('repeats starting point "idea"'));
    expect(problems).toContainEqual(expect.stringContaining('repeats navigation entry "overview"'));
  });
});

describe("validateSolutionRegistry", () => {
  it("passes a well-formed registry", () => {
    expect(validateSolutionRegistry(makeRegistry([makeSolution()]))).toEqual([]);
  });

  it("requires a revision so caches can be invalidated", () => {
    const registry = { revision: "", solutions: [makeSolution()] };
    expect(validateSolutionRegistry(registry)).toContainEqual(
      expect.stringContaining("missing a revision"),
    );
  });

  it("rejects a duplicated solution key", () => {
    const registry = makeRegistry([makeSolution(), makeSolution()]);
    expect(validateSolutionRegistry(registry)).toContainEqual(
      expect.stringContaining('defines "software_delivery" more than once'),
    );
  });
});

describe("findSolution", () => {
  it("returns null rather than throwing for a missing key", () => {
    expect(findSolution(makeRegistry([]), ESolutionKey.SoftwareDelivery)).toBeNull();
  });
});

describe("isDraftStale", () => {
  const draft = (version: number) => ({ solution_version: version }) as ISetupDraft;

  it("is fresh when the versions match", () => {
    expect(isDraftStale(draft(1), makeSolution({ version: 1 }))).toBe(false);
  });

  it("is stale once the definition moves on, so answers get re-validated", () => {
    expect(isDraftStale(draft(1), makeSolution({ version: 2 }))).toBe(true);
  });
});
