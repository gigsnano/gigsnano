/** A node in the codebase graph — one symbol/file, or a collapsed community
 * super-node once the backend aggregates a graph past its node cap. */
export interface ICodeGraphNode {
  id: string;
  label?: string;
  kind?: string;
  community?: string;
  source_file?: string;
  /** true when SCIP degraded to structural-only for this node's language, so its
   * precise cross-file edges are unavailable (drives the index-quality signal). */
  degraded?: boolean;
}

export interface ICodeGraphEdge {
  source: string;
  target: string;
  weight?: number;
}

/** Shape of `GET .../code/graph/` — mirrors the backend's `graph.json` (Plan 1). */
export interface ICodeGraph {
  nodes: ICodeGraphNode[];
  edges: ICodeGraphEdge[];
}

/** A story linked to code in the SDLC graph (GIA-15). */
export interface ICodeStoryRef {
  node_id: string;
  code: string;
}

/** `GET .../code/symbols/{node_id}/traceability/` — real code↔story links. */
export interface ISymbolTraceability {
  stories: ICodeStoryRef[];
  impacted: ICodeStoryRef[];
}
