"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { IDiagramNode } from "@/types";

/** React Flow node data carries the parsed diagram node plus a drill-down callback. */
export interface IDiagramNodeData {
  node: IDiagramNode;
  onDrillDown?: (node: IDiagramNode) => void;
  [key: string]: unknown;
}

export function DiagramNode({ data }: NodeProps) {
  const { node, onDrillDown } = data as unknown as IDiagramNodeData;
  const canDrill = Boolean(node.expandable && onDrillDown);
  return (
    <div
      className={cn(
        "min-w-[150px] max-w-[220px] rounded-lg border bg-card px-3 py-2 shadow-sm",
        canDrill && "cursor-pointer transition-colors hover:border-primary/60",
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-foreground">{node.label}</span>
        {canDrill ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">›</span> : null}
      </div>
      <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-muted-foreground">
        {node.kind}
      </span>
      {node.summary ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{node.summary}</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-border" />
    </div>
  );
}
