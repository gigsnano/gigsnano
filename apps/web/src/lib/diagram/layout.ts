import dagre from "dagre";
import type { IDiagramBlock } from "@/types";

export interface IPositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 190;
const DEFAULT_HEIGHT = 68;

/**
 * Position a diagram's nodes with dagre (top-to-bottom). dagre centers nodes;
 * React Flow positions by top-left corner, so we shift by half the size.
 */
export function layoutDiagram(
  block: IDiagramBlock,
  opts?: { nodeWidth?: number; nodeHeight?: number },
): IPositionedNode[] {
  const width = opts?.nodeWidth ?? DEFAULT_WIDTH;
  const height = opts?.nodeHeight ?? DEFAULT_HEIGHT;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of block.nodes) g.setNode(node.id, { width, height });
  for (const edge of block.edges) g.setEdge(edge.source, edge.target);

  dagre.layout(g);

  return block.nodes.map((node) => {
    const pos = g.node(node.id);
    return { id: node.id, x: pos.x - width / 2, y: pos.y - height / 2, width, height };
  });
}
