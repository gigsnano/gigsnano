import { describe, expect, it } from "vitest";
import { callGraph } from "./flow-graph";
import type { ICodeGraph } from "@/types";

const g: ICodeGraph = {
  nodes: [
    { id: "f", label: "foo", kind: "function", source_file: "src/a.py" },
    { id: "b", label: "bar", kind: "function", source_file: "src/b.py" },
    { id: "c", label: "C", kind: "class", source_file: "src/b.py" },
  ],
  edges: [
    { source: "f", target: "b", weight: 1 }, // call
    { source: "c", target: "f", weight: 1 }, // class->fn, dropped
  ],
};

describe("callGraph", () => {
  it("keeps only callable nodes and edges between them", () => {
    const cg = callGraph(g);
    expect(cg.nodes.map((n) => n.id).sort()).toEqual(["b", "f"]);
    expect(cg.edges).toHaveLength(1);
    expect(cg.edges[0]).toMatchObject({ source: "f", target: "b" });
  });
});
