"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";

import { EmptyState } from "@/components/empty-state";
import { useProjectRelations } from "@/hooks/story/use-story-detail";
import { buildDependencyGraph, type IDepEdge } from "@/lib/issues/dependency-graph";
import { EStoryRelationType, type IStory } from "@/types";

import { IssueGraphNode, type IIssueGraphNodeData } from "./issue-graph-node";

// Module-level so React Flow doesn't re-instantiate node types every render.
const nodeTypes = { issue: IssueGraphNode };

const NODE_W = 220;
const NODE_H = 64;

/** Containment and blocking are different claims, so they must not look alike: a solid
 * grey line *contains*, a red arrow *gates*, a dashed line merely *mentions*. */
function edgeStyle(kind: IDepEdge["kind"]): Pick<Edge, "style" | "animated" | "label"> {
  if (kind === "parent") {
    return { style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5, opacity: 0.5 } };
  }
  if (kind === EStoryRelationType.Blocks) {
    return { style: { stroke: "var(--destructive)", strokeWidth: 2 }, animated: true, label: "blocks" };
  }
  if (kind === EStoryRelationType.Duplicate) {
    return { style: { stroke: "var(--muted-foreground)", strokeDasharray: "2 3" }, label: "duplicate" };
  }
  return { style: { stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }, label: "relates" };
}

/**
 * Work Items "Graph" layout: the project's containment tree plus its relation edges,
 * laid out left-to-right with dagre (same engine as the ER canvas).
 *
 * Renders the *filtered* story set, so it answers "how does what I'm looking at hang
 * together" rather than always showing the whole project.
 */
function GraphBody({
  workspaceSlug,
  projectId,
  data,
}: {
  workspaceSlug: string;
  projectId: string;
  data: { stories: IStory[] };
}) {
  // Relations are a separate, cheap call — the story list has parent_id but not edges.
  const { data: relations } = useProjectRelations(workspaceSlug, projectId);

  // No useMemo: React Compiler caches this. The dagre pass is O(nodes+edges) over a
  // graph that is already filtered down to linked items only.
  const { nodes, edges, isolatedCount } = (() => {
    const graph = buildDependencyGraph(data.stories, relations ?? []);

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 90 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of graph.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
    for (const e of graph.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);

    const rfNodes: Node<IIssueGraphNodeData>[] = graph.nodes.map((n) => {
      const pos = g.node(n.id);
      return {
        id: n.id,
        type: "issue",
        position: { x: pos?.x ?? 0, y: pos?.y ?? 0 },
        data: { story: n.story, inCycle: graph.cycleNodeIds.has(n.id) },
      };
    });

    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      ...edgeStyle(e.kind),
    }));

    return { nodes: rfNodes, edges: rfEdges, isolatedCount: graph.isolatedCount };
  })();

  if (nodes.length === 0) {
    return (
      <EmptyState
        assetKey="generic"
        title="Nothing is linked yet"
        description={
          isolatedCount === 1
            ? "This work item has no parent, sub-items or relations, so there's nothing to graph. Link items as sub-items, or add a blocking relation from a work item's detail panel."
            : `None of these ${isolatedCount} work items are linked to each other. Add a parent or a blocking relation from a work item's detail panel and they'll appear here.`
        }
      />
    );
  }

  return (
    <div className="relative size-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        className="size-full"
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-muted" />
      </ReactFlow>
      {/* Never hide a cap: the graph shows a subset of what the filters matched. */}
      {isolatedCount > 0 ? (
        <p className="pointer-events-none absolute right-2 top-2 rounded-md border bg-card/90 px-2 py-1 text-xs text-muted-foreground">
          {isolatedCount} unlinked {isolatedCount === 1 ? "item" : "items"} hidden
        </p>
      ) : null}
    </div>
  );
}

export function IssuesGraphView({
  workspaceSlug,
  projectId,
  data,
}: {
  workspaceSlug: string;
  projectId: string;
  data: { stories: IStory[] };
}) {
  if (data.stories.length === 0) {
    return (
      <EmptyState
        assetKey="generic"
        title="Nothing to graph"
        description="No work items match the current filters."
      />
    );
  }

  return (
    <ReactFlowProvider>
      <GraphBody workspaceSlug={workspaceSlug} projectId={projectId} data={data} />
    </ReactFlowProvider>
  );
}
