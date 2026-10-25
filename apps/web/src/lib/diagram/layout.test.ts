import { describe, expect, it } from "vitest";
import { layoutDiagram } from "./layout";
import { EDiagramKind, type IDiagramBlock } from "@/types";

const block: IDiagramBlock = {
  id: "d",
  kind: EDiagramKind.Flow,
  nodes: [
    { id: "a", label: "A", kind: "node" },
    { id: "b", label: "B", kind: "node" },
  ],
  edges: [{ source: "a", target: "b" }],
};

describe("layoutDiagram", () => {
  it("returns one positioned node per input node", () => {
    const positioned = layoutDiagram(block);
    expect(positioned.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("gives every node finite coordinates and the requested size", () => {
    const positioned = layoutDiagram(block, { nodeWidth: 200, nodeHeight: 80 });
    for (const n of positioned) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.width).toBe(200);
      expect(n.height).toBe(80);
    }
  });

  it("places the target below the source for a top-to-bottom edge", () => {
    const positioned = layoutDiagram(block);
    const a = positioned.find((n) => n.id === "a")!;
    const b = positioned.find((n) => n.id === "b")!;
    expect(b.y).toBeGreaterThan(a.y);
  });

  it("handles a single node with no edges", () => {
    const single: IDiagramBlock = { ...block, nodes: [block.nodes[0]], edges: [] };
    expect(layoutDiagram(single)).toHaveLength(1);
  });
});
