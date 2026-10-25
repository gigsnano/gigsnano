import { describe, expect, it } from "vitest";

import { seedTopology, validateTopology, toMermaid, type ITopology } from "./topology";

describe("validateTopology", () => {
  it("flags the seed's unowned layer as a warning and is otherwise clean", () => {
    const issues = validateTopology(seedTopology());
    const owner = issues.filter((i) => i.kind === "missing-owner");
    expect(owner).toHaveLength(1);
    expect(owner[0].layerId).toBe("core");
    expect(issues.some((i) => i.severity === "error")).toBe(false);
  });

  it("detects orphan layers and undefined interfaces", () => {
    const t: ITopology = {
      layers: [
        { id: "a", name: "A", type: "api", purpose: "", tech: "", repo: "", owner: "T", environments: [], dataClass: "none", maturity: "planned" },
        { id: "b", name: "B", type: "data", purpose: "", tech: "", repo: "", owner: "T", environments: [], dataClass: "none", maturity: "planned" },
        { id: "orphan", name: "Orphan", type: "shared", purpose: "", tech: "", repo: "", owner: "T", environments: [], dataClass: "none", maturity: "planned" },
      ],
      dependencies: [{ from: "a", to: "b", interface: "", rationale: "" }],
    };
    const issues = validateTopology(t);
    expect(issues.some((i) => i.kind === "orphan-layer" && i.layerId === "orphan")).toBe(true);
    expect(issues.some((i) => i.kind === "undefined-interface")).toBe(true);
  });

  it("detects a dependency cycle", () => {
    const t: ITopology = {
      layers: ["a", "b"].map((id) => ({
        id, name: id, type: "service" as const, purpose: "", tech: "", repo: "", owner: "T", environments: [], dataClass: "none" as const, maturity: "planned" as const,
      })),
      dependencies: [
        { from: "a", to: "b", interface: "x", rationale: "" },
        { from: "b", to: "a", interface: "x", rationale: "" },
      ],
    };
    expect(validateTopology(t).some((i) => i.kind === "dependency-cycle")).toBe(true);
  });
});

describe("toMermaid", () => {
  it("emits a flowchart with labelled nodes and edges", () => {
    const m = toMermaid(seedTopology());
    expect(m.startsWith("flowchart TD")).toBe(true);
    expect(m).toContain('web["Web frontend"]');
    expect(m).toContain("web -->|REST| api");
  });
});
