import { describe, expect, it } from "vitest";
import { buildModuleTree } from "./module-tree";
import { capOpenKeys, defaultOpenKeys } from "./graph-cap";
import type { ICodeGraph } from "@/types";

// 4 files under src/a (2) and src/b (1) + one test file
const graph: ICodeGraph = {
  nodes: [
    { id: "1", label: "x.py", kind: "file", source_file: "src/a/x.py" },
    { id: "2", label: "X", kind: "class", source_file: "src/a/x.py" },
    { id: "3", label: "y.py", kind: "file", source_file: "src/a/y.py" },
    { id: "4", label: "z.py", kind: "file", source_file: "src/b/z.py" },
    { id: "5", label: "t.py", kind: "file", source_file: "tests/t.py" },
  ],
  edges: [],
};

describe("defaultOpenKeys", () => {
  it("opens the top level and src one level", () => {
    const t = buildModuleTree(graph);
    const open = defaultOpenKeys(t, ["src"]);
    // "src" opened -> its child buckets (src/a, src/b) are the visible frontier
    expect(open.has("src")).toBe(true);
    expect(open.has("src/a")).toBe(false); // one level only, not drilled into a
  });

  it("drills through single-child chains to the branch point", () => {
    const g: ICodeGraph = {
      nodes: [
        { id: "1", label: "x.py", kind: "file", source_file: "src/pkg/a/x.py" },
        { id: "2", label: "y.py", kind: "file", source_file: "src/pkg/b/y.py" },
      ],
      edges: [],
    };
    const t = buildModuleTree(g);
    const open = defaultOpenKeys(t, ["src"]);
    expect(open.has("src")).toBe(true);
    expect(open.has("src/pkg")).toBe(true); // single child -> drilled through
    expect(open.has("src/pkg/a")).toBe(false); // branch point's children stay closed
  });
});

describe("capOpenKeys", () => {
  it("drops deepest open keys until under the cap", () => {
    const t = buildModuleTree(graph);
    const open = new Set(["src", "src/a", "src/a/x.py"]); // would expose leaves
    const { open: capped, capped: didCap } = capOpenKeys(t, open, 3);
    expect(didCap).toBe(true);
    expect(capped.has("src/a/x.py")).toBe(false); // deepest dropped first
  });
  it("leaves a small frontier untouched", () => {
    const t = buildModuleTree(graph);
    const open = new Set(["src"]);
    const { capped } = capOpenKeys(t, open, 100);
    expect(capped).toBe(false);
  });

  it("respects hidden modules when capping (module filter narrows the frontier)", () => {
    // Two top-level modules: "a" drilled down to one leaf; "b" fanned across 4
    // subdirs so opening it alone (unfiltered) inflates the frontier past the cap.
    const g: ICodeGraph = {
      nodes: [
        { id: "1", label: "leaf.py", kind: "file", source_file: "a/x/leaf.py" },
        { id: "2", label: "f1.py", kind: "file", source_file: "b/p1/f1.py" },
        { id: "3", label: "f2.py", kind: "file", source_file: "b/p2/f2.py" },
        { id: "4", label: "f3.py", kind: "file", source_file: "b/p3/f3.py" },
        { id: "5", label: "f4.py", kind: "file", source_file: "b/p4/f4.py" },
      ],
      edges: [],
    };
    const t = buildModuleTree(g);
    const open = new Set(["a", "a/x", "a/x/leaf.py", "b"]);

    // Unfiltered: "a/x/leaf.py" (1) + b's 4 subdir buckets = 5 nodes > maxNodes 3 -> caps,
    // evicting the deepest open key (a/x/leaf.py) first even though module "b" is filtered out.
    const { capped: cappedNoHide, open: openNoHide } = capOpenKeys(t, open, 3);
    expect(cappedNoHide).toBe(true);
    expect(openNoHide.has("a/x/leaf.py")).toBe(false); // bug: over-evicted

    // Module filter hides "b" -> the rendered frontier is just "a/x/leaf.py" (1 node),
    // well under the cap, so nothing should be evicted once `hidden` is respected.
    const hidden = new Set(["b"]);
    const { open: capped, capped: didCap } = capOpenKeys(t, open, 3, hidden);
    expect(didCap).toBe(false);
    expect(capped.has("a/x/leaf.py")).toBe(true); // must NOT have been dropped
  });
});
