export enum EDiagramKind {
  Flow = "flow",
  Sequence = "sequence",
  CodeGraph = "codegraph",
  Architecture = "architecture",
}

export interface IDiagramNode {
  id: string;
  label: string;
  /** Semantic role, e.g. "route" | "controller" | "service" | "model" | "external". */
  kind: string;
  summary?: string;
  /** Markdown revealed on drill-down. */
  detail?: string;
  file?: string;
  line?: number;
  expandable?: boolean;
  /** Optional pre-fetched subgraph for local expansion. */
  children?: IDiagramNode[];
}

export interface IDiagramEdge {
  source: string;
  target: string;
  label?: string;
  kind?: string;
}

export interface IDiagramBlock {
  id: string;
  kind: EDiagramKind;
  title?: string;
  layout?: "dagre" | "elk" | "force";
  nodes: IDiagramNode[];
  edges: IDiagramEdge[];
  /** Commit the diagram was generated against (staleness stamp). */
  based_on_sha?: string;
}
