"use client";

import { useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowExpand01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { layoutDiagram } from "@/lib/diagram/layout";
import type { IDiagramBlock, IDiagramNode } from "@/types";
import { DiagramNode, type IDiagramNodeData } from "./diagram-node";

// Module-level (stable reference) — React Flow re-instantiates node types on
// every render otherwise, and react-doctor/react-flow both require this.
const nodeTypes = { gigs: DiagramNode };

export function DiagramCanvas({
  block,
  onDrillDown,
}: {
  block: IDiagramBlock;
  onDrillDown?: (node: IDiagramNode) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const positioned = layoutDiagram(block);
  const byId = new Map(block.nodes.map((n) => [n.id, n]));

  const nodes: Node<IDiagramNodeData>[] = positioned.map((p) => ({
    id: p.id,
    type: "gigs",
    position: { x: p.x, y: p.y },
    data: { node: byId.get(p.id)!, onDrillDown },
  }));

  const edges: Edge[] = block.edges.map((e, i) => ({
    id: `${e.source}->${e.target}-${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: false,
  }));

  const handleNodeClick = (_: unknown, n: Node) => {
    const node = byId.get(n.id);
    if (node?.expandable && onDrillDown) onDrillDown(node);
  };

  const flow = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );

  return (
    <>
      <div className="group relative mt-2 h-64 w-full overflow-hidden rounded-lg border bg-muted/30">
        {block.title ? (
          <div className="flex items-center justify-between border-b bg-card px-3 py-1.5">
            <span className="text-xs font-medium text-foreground">{block.title}</span>
            {block.based_on_sha ? (
              <span className="text-[10px] text-muted-foreground">
                based on {block.based_on_sha.slice(0, 7)}
              </span>
            ) : null}
          </div>
        ) : null}
        {flow}
        {/* Full-screen — the inline canvas is small; open a large modal (GIN-105). */}
        <button
          type="button"
          aria-label="Expand diagram"
          title="Expand"
          onClick={() => setFullscreen(true)}
          className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md border bg-background/90 text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        >
          <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" />
        </button>
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="flex h-[88vh] w-[92vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <DialogTitle className="text-sm font-medium">{block.title || "Diagram"}</DialogTitle>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setFullscreen(false)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          </div>
          {/* Re-mount a fresh flow so it fits-to-view at the larger size. */}
          <div className="min-h-0 flex-1">{fullscreen ? flow : null}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
