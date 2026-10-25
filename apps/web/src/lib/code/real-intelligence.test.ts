import { describe, expect, it } from "vitest";

import {
  aggregateSubtree,
  buildRealTree,
  computeRealMetrics,
  computeRealModules,
  fileComplexityFromMetrics,
  fileRiskFromMetrics,
  indexQuality,
} from "./real-intelligence";
import type { ICodeGraph } from "@/types";
import type { ICodeMetrics } from "@/types/code/metrics";
import { EIndexStatus } from "@/types";

const graph: ICodeGraph = {
  nodes: [
    { id: "1", label: "auth.py", kind: "file", source_file: "src/auth/auth.py" },
    { id: "2", label: "AuthService", kind: "class", source_file: "src/auth/auth.py" },
    { id: "3", label: "login", kind: "function", source_file: "src/auth/auth.py" },
    { id: "4", label: "test_auth.py", kind: "file", source_file: "tests/test_auth.py" },
    { id: "5", label: "proj.py", kind: "file", source_file: "src/projects/proj.py" },
  ],
  edges: [],
};

const metrics: ICodeMetrics = {
  totals: { files: 4, loc: 900 },
  languages: [{ name: "Python", loc: 900 }],
  languages_source: "scc",
  complexity: {
    buckets: [],
    worst: [{ name: "login", file: "src/auth/auth.py", ccn: 25 }],
  },
  duplication: { percent: 3 },
  hotspots: [
    { file: "src/auth/auth.py", complexity: 40, churn: 30, hotspot: 0.9 },
    { file: "src/projects/proj.py", complexity: 12, churn: 5, hotspot: 0.3 },
  ],
  dependencies: { cycles: [] },
  // These tests cover graph/risk derivation, which doesn't read issues; null keeps
  // the fixture honest (this metrics blob was never scanned) rather than implying
  // a clean scan.
  issues: null,
};

describe("computeRealMetrics", () => {
  it("counts classes/functions/tests/modules from the real graph", () => {
    const m = computeRealMetrics(graph, null);
    const by = Object.fromEntries(m.map((x) => [x.key, x.value]));
    expect(by.classes).toBe(1);
    expect(by.functions).toBe(1);
    expect(by.tests).toBe(1); // tests/test_auth.py
    expect(by.modules).toBe(3); // src/auth, src/projects, tests
  });
});

describe("buildRealTree", () => {
  it("nests folders/files from paths with rolled-up counts", () => {
    const t = buildRealTree(graph, "repo");
    expect(t.type).toBe("repository");
    const src = t.children!.find((c) => c.name === "src")!;
    expect(src.type).toBe("folder");
    const auth = src.children!.find((c) => c.name === "auth")!;
    expect(auth.nodeCount).toBe(3); // auth.py + AuthService + login
    const file = auth.children!.find((c) => c.name === "auth.py")!;
    expect(file.type).toBe("file");
  });

  it("sorts folders before files", () => {
    const t = buildRealTree(graph, "repo");
    const types = t.children!.map((c) => c.type);
    expect(types.indexOf("folder")).toBeLessThanOrEqual(types.lastIndexOf("folder"));
  });
});

describe("computeRealModules", () => {
  it("returns top-level dirs by symbol count desc", () => {
    const mods = computeRealModules(graph);
    expect(mods[0].name).toBe("auth"); // 3 symbols
    expect(mods.map((m) => m.name)).toContain("projects");
  });

  it("attaches real risk from metrics hotspots (max of member files)", () => {
    const mods = computeRealModules(graph, metrics);
    const auth = mods.find((m) => m.name === "auth")!;
    const projects = mods.find((m) => m.name === "projects")!;
    expect(auth.risk).toBe("high"); // auth.py hotspot 0.9
    expect(projects.risk).toBe("medium"); // proj.py hotspot 0.3
  });
});

describe("fileRiskFromMetrics", () => {
  it("buckets hotspot score into risk levels by rel path", () => {
    const risk = fileRiskFromMetrics(metrics);
    expect(risk.get("src/auth/auth.py")).toBe("high");
    expect(risk.get("src/projects/proj.py")).toBe("medium");
  });
  it("is empty without metrics", () => {
    expect(fileRiskFromMetrics(null).size).toBe(0);
  });
});

describe("fileComplexityFromMetrics", () => {
  it("buckets worst-function CCN for the file", () => {
    expect(fileComplexityFromMetrics(metrics, "src/auth/auth.py")).toBe("high"); // ccn 25
  });
  it("returns undefined for a file with no measured complexity", () => {
    expect(fileComplexityFromMetrics(metrics, "src/projects/proj.py")).toBeUndefined();
    expect(fileComplexityFromMetrics(null, "x")).toBeUndefined();
  });
});

describe("buildRealTree with metrics", () => {
  it("sets file risk and rolls it up to ancestor folders", () => {
    const t = buildRealTree(graph, "repo", metrics);
    const src = t.children!.find((c) => c.name === "src")!;
    const auth = src.children!.find((c) => c.name === "auth")!;
    const file = auth.children!.find((c) => c.name === "auth.py")!;
    expect(file.risk).toBe("high");
    expect(auth.risk).toBe("high"); // rolled up
    expect(src.risk).toBe("high"); // rolled up
  });
});

describe("aggregateSubtree", () => {
  it("aggregates counts + risk under a dir prefix", () => {
    const a = aggregateSubtree(graph, "src/auth", metrics);
    expect(a.classes).toBe(1); // AuthService
    expect(a.functions).toBe(1); // login
    expect(a.files).toBe(1); // auth.py
    expect(a.risk).toBe("high"); // auth.py is a 0.9 hotspot
    expect(a.hotspots).toContain("src/auth/auth.py");
  });

  it("treats an empty prefix as the whole repo", () => {
    const a = aggregateSubtree(graph, "", metrics);
    expect(a.nodeCount).toBe(5); // all 5 graph nodes
    expect(a.files).toBe(3);     // src/auth/auth.py, tests/test_auth.py, src/projects/proj.py
    expect(a.submodules).toBe(2); // top-level dirs: src, tests
  });

  it("counts a single-char top-level dir as its own submodule with an empty prefix", () => {
    // Regression guard for the off-by-one: `p.slice(prefix.length + 1)` on an empty
    // prefix becomes `p.slice(1)`, which strips "a" from "a/f.py" down to "/f.py" ->
    // filter(Boolean) drops the leading empty segment -> "a" silently uncounted.
    const g: ICodeGraph = {
      nodes: [{ id: "1", label: "f.py", kind: "file", source_file: "a/f.py" }],
      edges: [],
    };
    expect(aggregateSubtree(g, "", null).submodules).toBe(1); // "a"
  });
});

describe("indexQuality", () => {
  it("reports healthy with symbols + relationships", () => {
    const q = indexQuality(graph, EIndexStatus.Ready);
    expect(q.level).toBe("healthy");
    expect(q.symbols).toBe(2); // AuthService + login
    expect(q.relationships).toBe(0);
    expect(q.files).toBe(3); // auth.py, test_auth.py, proj.py
  });

  it("reports partial when ready but no symbols", () => {
    const q = indexQuality({ nodes: [{ id: "1", kind: "file", source_file: "a.py" }], edges: [] }, EIndexStatus.Ready);
    expect(q.level).toBe("partial");
    expect(q.symbols).toBe(0);
    expect(q.files).toBe(1);
  });

  it("reports none when not ready", () => {
    expect(indexQuality(null, EIndexStatus.Pending).level).toBe("none");
  });

  it("reports none when status is not Ready", () => {
    expect(indexQuality(graph, EIndexStatus.Pending).level).toBe("none");
  });

  it("reports none when graph is empty", () => {
    expect(indexQuality({ nodes: [], edges: [] }, EIndexStatus.Ready).level).toBe("none");
  });

  it("reports degraded when any node is degraded", () => {
    const degradedGraph: ICodeGraph = {
      nodes: [
        { id: "1", label: "auth.py", kind: "file", source_file: "src/auth/auth.py" },
        { id: "2", label: "AuthService", kind: "class", source_file: "src/auth/auth.py", degraded: true },
      ],
      edges: [],
    };
    const q = indexQuality(degradedGraph, EIndexStatus.Ready);
    expect(q.level).toBe("degraded");
    expect(q.symbols).toBe(1);
  });

  it("counts interface nodes as symbols", () => {
    const graphWithInterface: ICodeGraph = {
      nodes: [
        { id: "1", label: "service.py", kind: "file", source_file: "src/service.py" },
        { id: "2", label: "IService", kind: "interface", source_file: "src/service.py" },
      ],
      edges: [],
    };
    const q = indexQuality(graphWithInterface, EIndexStatus.Ready);
    expect(q.symbols).toBe(1);
  });
});
