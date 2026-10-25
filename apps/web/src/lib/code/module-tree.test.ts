import { describe, expect, it } from "vitest";

import type { ICodeGraph } from "@/types";

import { ancestorsToOpen, buildModuleTree, computeVisibleGraph, relPath } from "./module-tree";

const graph: ICodeGraph = {
  nodes: [
    { id: "a", label: "board.tsx", source_file: "G:\\repo\\src\\components\\board.tsx" },
    { id: "b", label: "sprint.tsx", source_file: "src/components/sprint.tsx" },
    { id: "c", label: "use-x.ts", source_file: "src/hooks/use-x.ts" },
    { id: "d1", label: "foo()", source_file: "src/lib/util.ts" },
    { id: "d2", label: "bar()", source_file: "src/lib/util.ts" },
  ],
  edges: [
    { source: "a", target: "c" },
    { source: "b", target: "c" },
    { source: "c", target: "d1" },
  ],
};

describe("module-tree", () => {
  it("normalizes absolute + backslash paths to repo-relative", () => {
    expect(relPath("G:\\git\\repo\\src\\app\\x.tsx")).toBe("src/app/x.tsx");
    expect(relPath("src/hooks/use-x.ts")).toBe("src/hooks/use-x.ts");
  });

  it("default view shows only top-level (1-segment) modules", () => {
    const tree = buildModuleTree(graph);
    const { nodes } = computeVisibleGraph(tree, new Set(), new Set());
    // all five files live under src -> one collapsed module node
    expect(nodes.map((n) => n.id)).toEqual(["src"]);
    expect(nodes[0].isLeaf).toBe(false);
  });

  it("drills module -> subdir -> file, siblings stay collapsed", () => {
    const tree = buildModuleTree(graph);
    // open src, then src/components
    const { nodes } = computeVisibleGraph(
      tree,
      new Set(["src", "src/components"]),
      new Set(),
    );
    const ids = nodes.map((n) => n.id).sort();
    expect(ids).toContain("src/components/board.tsx");
    expect(ids).toContain("src/components/sprint.tsx");
    expect(ids).toContain("src/hooks"); // sibling subdir still collapsed
    expect(ids).toContain("src/lib");
    expect(nodes.find((n) => n.id === "src/components/board.tsx")!.isLeaf).toBe(true);
  });

  it("a multi-symbol file drills one level further into its symbols", () => {
    const tree = buildModuleTree(graph);
    const open = new Set(ancestorsToOpen(tree, "d1"));
    const { nodes } = computeVisibleGraph(tree, open, new Set());
    const leaves = nodes.filter((n) => n.isLeaf).map((n) => n.realId);
    expect(leaves).toContain("d1");
    expect(leaves).toContain("d2");
  });

  it("aggregates edges to the visible reps and hides muted modules", () => {
    const tree = buildModuleTree(graph);
    // open src so subdir reps are visible; a->c and b->c collapse to one edge
    const { edges } = computeVisibleGraph(tree, new Set(["src"]), new Set());
    const compHooks = edges.filter(
      (e) =>
        (e.from === "src/components" && e.to === "src/hooks") ||
        (e.from === "src/hooks" && e.to === "src/components"),
    );
    expect(compHooks).toHaveLength(1);

    // muting the top-level module drops it entirely
    const hidden = computeVisibleGraph(tree, new Set(), new Set(["src"]));
    expect(hidden.nodes).toHaveLength(0);
  });
});
