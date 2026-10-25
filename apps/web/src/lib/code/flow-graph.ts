import type { ICodeGraph } from "@/types";

const CALLABLE = new Set(["function", "method"]);

/** Real Call Flow: the symbol graph restricted to callable nodes and the edges
 * between two callable nodes. Edges are untyped ({source,target,weight}); a call
 * between callables is the honest proxy — no relation type is invented. */
export function callGraph(graph: ICodeGraph): ICodeGraph {
  const callable = new Set(
    graph.nodes.filter((n) => CALLABLE.has((n.kind ?? "").toLowerCase())).map((n) => n.id),
  );
  const nodes = graph.nodes.filter((n) => callable.has(n.id));
  const edges = graph.edges.filter((e) => callable.has(e.source) && callable.has(e.target));
  return { nodes, edges };
}
