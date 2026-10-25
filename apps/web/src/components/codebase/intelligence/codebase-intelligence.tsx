"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { EmptyState } from "@/components/empty-state";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { communityColor } from "@/lib/code/community-color";
import {
  emptyFilters,
  filterTypedGraph,
  FLOW_RELATIONS,
  type ICodebaseFilters,
} from "@/lib/code/graph-filter";
import { capOpenKeys, defaultOpenKeys } from "@/lib/code/graph-cap";
import { isOverviewDashboardEnabled } from "@/lib/code/codebase-overview-flag";
import { callGraph } from "@/lib/code/flow-graph";
import { cardLabel, kindToNodeType, nodeTypeMeta } from "@/lib/code/node-type";
import {
  aggregateSubtree,
  fileComplexityFromMetrics,
  fileRiskFromMetrics,
  indexQuality,
} from "@/lib/code/real-intelligence";
import {
  ancestorsToOpen,
  buildModuleTree,
  computeVisibleGraph,
  relPath,
  type TModuleTree,
  type TVisibleEdge,
  type TVisibleNode,
} from "@/lib/code/module-tree";
import { useCodebaseIntelligence } from "@/hooks/codebase/use-codebase-intelligence";
import { useCodebaseWorkspace } from "@/hooks/codebase/use-codebase-workspace";
import { useCodebaseUiStore } from "@/store/ui/codebase-ui.store";
import { useErSchema, useGenerateErSchema } from "@/hooks/code/use-erd";
import { useSymbolTraceability } from "@/hooks/code/use-symbol-traceability";
import type {
  CodebaseViewId,
  CodeNode,
  CodeNodeType,
  ICodebaseIntelligence,
  ICodebaseMetric,
  INodeInspectorDetail,
  ICodeTreeNode,
} from "@/types/code/intelligence";
import type { ICodeMetrics } from "@/types/code/metrics";
import { EIndexStatus, type ICodeGraph } from "@/types";

import { IssuesScreen } from "../issues/issues-screen";
import { MetricsTab } from "../metrics/metrics-tab";
import { CodebaseMetricBar } from "./codebase-metric-bar";
import { CodebaseAskScreen } from "./codebase-ask-screen";
import { CodebaseViewTabs } from "./codebase-view-tabs";
import { CodeExplorer } from "./code-explorer";
import { GraphEmptyState } from "./graph-empty-state";
import { GraphLegend } from "./graph-legend";
import { GraphToolbar, type TGraphLayout } from "./graph-toolbar";
import { IndexingOverlay } from "./indexing-overlay";
import { IndexingProgress } from "./indexing-progress";
import { IndexQualityStrip } from "./index-quality";
import { NodeInspector } from "./node-inspector";
import { CodebaseOverviewDashboard } from "./overview/codebase-overview-dashboard";
import { RepositoryOverview } from "./repository-overview";

const CodebaseGraph = dynamic(
  () => import("../codebase-graph").then((m) => m.CodebaseGraph),
  { ssr: false, loading: () => <CanvasLoading label="Loading graph…" /> },
);
const ErdCanvas = dynamic(() => import("@/components/ai/chat/erd-canvas").then((m) => m.ErdCanvas), {
  ssr: false,
  loading: () => <CanvasLoading label="Loading schema…" />,
});

export function CodebaseIntelligence({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <CodebaseIntelligenceInner workspaceSlug={workspaceSlug} projectId={projectId} />
    </Suspense>
  );
}

function CodebaseIntelligenceInner({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, realGraph, realMetrics, indexStatus, isReady, isLoading, isError, refetch } =
    useCodebaseIntelligence(workspaceSlug, projectId);
  const quality = indexQuality(realGraph, indexStatus ?? EIndexStatus.None);
  // Pending and Indexing both mean "no graph yet, one is coming" — the screen is
  // equally useless in either, so both get the overlay (GIN-120).
  const isIndexing =
    indexStatus === EIndexStatus.Pending || indexStatus === EIndexStatus.Indexing;
  const ws = useCodebaseWorkspace();

  const [explorerQuery, setExplorerQuery] = useState("");
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  // Ask-screen open state is shared with the secondary-bar "Ask Codebase" action
  // (mounted in the layout via ProjectHeader), so it lives in a store not local state.
  const askOpen = useCodebaseUiStore((s) => s.askOpen);
  const openAsk = useCodebaseUiStore((s) => s.openAsk);
  const closeAsk = useCodebaseUiStore((s) => s.closeAsk);
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [layout, setLayout] = useState<TGraphLayout>("layered");
  // Seed the first-paint drill level once the tree loads, before the user has
  // touched anything — the "adjust state during render" pattern (react.dev),
  // no effect involved. `seededGraph`/`userTouchedOpen` are plain state (not
  // refs) so nothing reads/writes a ref during render. Compared against
  // `realGraph` (the TanStack Query data — referentially stable across
  // re-renders) rather than the freshly-built `tree` object, so the seed
  // guard doesn't depend on the compiler caching `buildModuleTree`.
  const [userTouchedOpen, setUserTouchedOpen] = useState(false);
  const [seededGraph, setSeededGraph] = useState<typeof realGraph>(null);

  const tree = realGraph ? buildModuleTree(realGraph) : null;
  if (tree && realGraph && !userTouchedOpen && seededGraph !== realGraph) {
    setSeededGraph(realGraph);
    setOpenKeys(defaultOpenKeys(tree));
  }
  const detail = resolveDetail(data, tree, ws.selectedId, realMetrics, realGraph);
  const layoutKind = layoutForView(ws.view);

  // The "Ask Code Intelligence" overlay is a full-screen z-20 layer. The view
  // tabs (Overview / API Flow / Call Flow / …) live in the header, above it, so
  // switching tabs while Ask is open used to change the view *behind* the overlay
  // — the tab looked dead because the new content stayed hidden (GIN-295). Close
  // Ask when the view changes. Adjust-state-during-render (react.dev), mirroring
  // the seed-open pattern above — no effect.
  const [askViewAnchor, setAskViewAnchor] = useState(ws.view);
  if (ws.view !== askViewAnchor) {
    setAskViewAnchor(ws.view);
    if (askOpen) closeAsk();
  }
  // Real code↔story links for the selected symbol (GIA-15); empty for fixture nodes.
  const trace = useSymbolTraceability(workspaceSlug, projectId, ws.selectedId, isReady);

  function handleMetricFilter(m: ICodebaseMetric) {
    const f = m.filter;
    const next: ICodebaseFilters = {
      nodeTypes: new Set(f?.nodeType ? [f.nodeType] : []),
      modules: new Set(),
      relations: new Set(f?.relation ? [f.relation] : []),
      query: "",
      preset: f?.preset,
    };
    ws.setFilters(next);
    ws.setView("dependencies");
  }

  function selectFromGraph(node: TVisibleNode) {
    setUserTouchedOpen(true);
    if (node.isLeaf && node.realId) {
      ws.select(node.realId);
    } else {
      setOpenKeys((prev) => {
        const nextSet = new Set(prev);
        if (nextSet.has(node.id)) nextSet.delete(node.id);
        else nextSet.add(node.id);
        return nextSet;
      });
    }
  }

  function selectFromTree(id: string) {
    setUserTouchedOpen(true);
    ws.select(id);
    // if the id maps into the real graph, drill the graph open to it
    if (tree && tree.chains.has(id)) {
      setOpenKeys(new Set([...openKeys, ...ancestorsToOpen(tree, id)]));
    }
  }

  const activeMetricKey =
    ws.filters.preset ?? [...ws.filters.nodeTypes][0] ?? undefined;

  /**
   * The graph column: toolbar + canvas + legend (GIN-121).
   *
   * Hoisted so it can render either in the resizable panel or in the full-screen
   * dialog — but never both. diagram-canvas keeps its inline copy mounted behind
   * the modal; a second vis-network instance simulating thousands of edges
   * off-screen would undo the very cost this ticket is about. Moving it between
   * parents remounts it, which is also what makes it fit-to-view at the new size:
   * vis measures its container at construction, so a resized-but-not-remounted
   * network would keep the small canvas's zoom.
   */
  const graphPanel = (
    <div className="flex size-full flex-col">
      <GraphToolbar
        filters={ws.filters}
        onFilters={ws.setFilters}
        layout={layout}
        onLayout={setLayout}
        modules={tree?.modules.map((m) => ({ key: m.key, name: m.label })) ?? []}
        onToggleFullscreen={() => setGraphFullscreen((v) => !v)}
        isFullscreen={graphFullscreen}
      />
      <div
        className="relative min-h-0 flex-1 bg-muted/30"
        style={{
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <GraphCanvas
          view={ws.view}
          data={data}
          tree={tree}
          realGraph={realGraph}
          openKeys={openKeys}
          realMetrics={realMetrics}
          filters={ws.filters}
          selectedId={ws.selectedId}
          layout={layout}
          isReady={isReady}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          onGraphSelect={selectFromGraph}
          onTypedSelect={ws.select}
          onClearFilters={() => ws.setFilters(emptyFilters())}
          onSetView={ws.setView}
        />
      </div>
      {data.modules ? (
        <GraphLegend modules={data.modules} onFocus={(k) => selectFromTree(k)} />
      ) : null}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3 p-6 pt-4">
      {/* Repo meta + tabs now live in the consolidated CodebaseContextHeader
          (GIN-273), mounted by ProjectHeader — the page body no longer stacks its
          own repo strip or tab row. */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-3">
        {/* The Overview dashboard owns its counts strip; the clickable metric bar
            is reserved for the graph/deep-dive views. */}
        {layoutKind !== "dashboard" ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <CodebaseMetricBar
              metrics={data.metrics}
              activeKey={activeMetricKey}
              onFilter={handleMetricFilter}
            />
          </div>
        ) : null}
        {layoutKind === "graph" ? <IndexQualityStrip quality={quality} /> : null}

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-card">
        {layoutKind === "dashboard" ? (
          <div className="size-full overflow-y-auto">
            <CodebaseOverviewDashboard
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              onOpenView={ws.setView}
              onAsk={openAsk}
            />
          </div>
        ) : layoutKind === "metrics" ? (
          <div className="size-full overflow-y-auto">
            <MetricsTab workspaceSlug={workspaceSlug} projectId={projectId} />
          </div>
        ) : layoutKind === "issues" ? (
          <div className="size-full overflow-y-auto">
            <IssuesScreen workspaceSlug={workspaceSlug} projectId={projectId} />
          </div>
        ) : layoutKind === "schema" ? (
          <SchemaCanvas workspaceSlug={workspaceSlug} projectId={projectId} isReady={isReady} />
        ) : (
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={20} minSize={14} className="min-w-[200px]">
              <CodeExplorer
                tree={data.tree}
                selectedId={ws.selectedId}
                onSelect={selectFromTree}
                query={explorerQuery}
                onQuery={setExplorerQuery}
              />
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={54} className="relative">
              {graphFullscreen ? (
                <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  Graph is open full screen.
                </div>
              ) : (
                graphPanel
              )}
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={26} minSize={20} className="min-w-[300px]">
              {detail ? (
                <NodeInspector
                  detail={detail}
                  liveStories={trace.data?.stories ?? []}
                  liveImpacted={trace.data?.impacted ?? []}
                  onSelect={ws.select}
                  onAsk={openAsk}
                />
              ) : data.repo ? (
                <RepositoryOverview
                  repo={data.repo}
                  metrics={data.metrics}
                  languages={realMetrics?.languages ?? null}
                  quality={quality}
                />
              ) : null}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
        </div>

        {/* The dashboard renders an honest per-section indexing state itself and
            polls until ready, so it isn't blanked by the blocking overlay. */}
        {isIndexing && layoutKind !== "dashboard" ? (
          <IndexingOverlay repo={data.repo?.repo} />
        ) : null}
      </div>

      {askOpen ? (
        <CodebaseAskScreen
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          data={data}
          detail={detail}
          languages={realMetrics?.languages ?? null}
          onSelect={ws.select}
          onClose={closeAsk}
        />
      ) : null}

      {/* Full-screen graph (GIN-121). A 54% column is not enough room for a
          frontier of this size; same shell as the chat/docs diagram viewers. */}
      <Dialog open={graphFullscreen} onOpenChange={setGraphFullscreen}>
        <DialogContent className="flex h-[88vh] w-[92vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <DialogTitle className="text-sm font-medium">Codebase graph</DialogTitle>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setGraphFullscreen(false)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">{graphFullscreen ? graphPanel : null}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- canvas ---------- */

const MAX_VISIBLE_NODES = 120;

function GraphCanvas({
  view,
  data,
  tree,
  realGraph,
  openKeys,
  realMetrics,
  filters,
  selectedId,
  layout,
  isReady,
  isLoading,
  isError,
  onRetry,
  onGraphSelect,
  onTypedSelect,
  onClearFilters,
  onSetView,
}: {
  view: string;
  data: ICodebaseIntelligence;
  tree: TModuleTree | null;
  realGraph: ICodeGraph | null;
  openKeys: Set<string>;
  realMetrics: ICodeMetrics | null;
  filters: ICodebaseFilters;
  selectedId: string | null;
  layout: TGraphLayout;
  isReady: boolean;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onGraphSelect: (n: TVisibleNode) => void;
  onTypedSelect: (id: string) => void;
  onClearFilters: () => void;
  onSetView: (view: CodebaseViewId) => void;
}) {
  // Overview / Modules / Dependencies / Call Flow → the real module-tree graph
  // (Call Flow narrows to the callable-symbol subgraph via `callGraph`).
  if (view === "overview" || view === "modules" || view === "dependencies" || view === "call-flow") {
    if (!isReady) {
      return (
        <EmptyState
          assetKey="generic"
          title="No codebase graph yet"
          description="Index this repo to explore it as a dependency graph."
        />
      );
    }
    if (isLoading) return <IndexingProgress />;
    if (isError) {
      return (
        <EmptyState
          assetKey="error"
          title="Couldn't load the codebase graph"
          description="Something went wrong fetching the graph."
          actions={[{ label: "Retry", onClick: onRetry }]}
        />
      );
    }
    const activeTree = view === "call-flow" && realGraph ? buildModuleTree(callGraph(realGraph)) : tree;
    if (!activeTree) return <CanvasLoading label="Building graph…" />;
    const hiddenModules = new Set<string>();
    if (filters.modules.size > 0) {
      for (const m of activeTree.modules) {
        if (!filters.modules.has(m.key)) hiddenModules.add(m.key);
      }
    }
    const { open: safeOpen, capped } = capOpenKeys(activeTree, openKeys, MAX_VISIBLE_NODES, hiddenModules);
    const visible = computeVisibleGraph(activeTree, safeOpen, hiddenModules);
    const totalUncapped = capped
      ? computeVisibleGraph(activeTree, openKeys, hiddenModules).nodes.length
      : visible.nodes.length;
    const riskByPath = fileRiskFromMetrics(realMetrics); // built once for the frontier
    const shaped = visible.nodes.map((n) => {
      if (!n.isLeaf || !n.realId) {
        const type: CodeNodeType = n.id.includes("/") ? "folder" : "module";
        return { ...n, shape: nodeTypeMeta(type).shape, label: cardLabel(n.label, type, n.count) };
      }
      const rn = activeTree.nodeById.get(n.realId);
      const type = kindToNodeType(rn?.kind, rn?.source_file);
      const risk = rn?.source_file ? riskByPath.get(relPath(rn.source_file)) : undefined;
      return { ...n, shape: nodeTypeMeta(type).shape, label: cardLabel(n.label, type), risk };
    });
    const selectedRep = selectedId
      ? visible.nodes.find((n) => n.realId === selectedId)?.id ?? null
      : null;
    return (
      <>
        {capped ? (
          <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md border bg-popover/95 px-2.5 py-1 text-xs text-popover-foreground shadow-sm">
            Showing {MAX_VISIBLE_NODES} of {totalUncapped} — drill in to expand
          </div>
        ) : null}
        <CodebaseGraph
          nodes={shaped}
          edges={visible.edges}
          selectedRep={selectedRep}
          layout={layout}
          onNodeClick={onGraphSelect}
        />
      </>
    );
  }

  // API Flow / Data Flow → typed relationship edges aren't extracted by the index yet.
  // Say so either way (GIN-156). This used to fall through to the fixture's typed
  // relation graph whenever the project wasn't indexed, so an un-indexed repo was shown
  // an invented architecture — api/service/table nodes belonging to no real project.
  if (!isReady) {
    return (
      <EmptyState
        assetKey="generic"
        title="No codebase graph yet"
        description="Index this repo to explore it as a dependency graph."
      />
    );
  }
  return (
    <EmptyState
      assetKey="generic"
      title="Typed relationships not available"
      description="API and data-flow edges need backend relationship typing, which the index doesn't extract yet. Explore the Dependencies view meanwhile."
      actions={[{ label: "View Dependencies", onClick: () => onSetView("dependencies") }]}
    />
  );
}

function SchemaCanvas({
  workspaceSlug,
  projectId,
  isReady,
}: {
  workspaceSlug: string;
  projectId: string;
  isReady: boolean;
}) {
  const { data: erSchema, isLoading } = useErSchema(workspaceSlug, projectId, isReady);
  const generate = useGenerateErSchema(workspaceSlug, projectId);
  if (!isReady) {
    return (
      <EmptyState assetKey="generic" title="No schema yet" description="Index this repo to extract its data model." />
    );
  }
  if (isLoading) return <CanvasLoading label="Loading schema…" />;
  if (erSchema && erSchema.tables.length > 0) {
    return (
      <div className="size-full bg-background">
        <ErdCanvas schema={erSchema} fill />
      </div>
    );
  }
  // On-demand generation (GIN-86): scan the repo's DB models (committed .dbml/Prisma,
  // else SQLAlchemy/Django) → ER schema. Read-only over the clone; primes the er cache.
  const scannedEmpty = generate.isSuccess && generate.data.tables.length === 0;
  return (
    <EmptyState
      assetKey="generic"
      title={scannedEmpty ? "No database models found" : "No data model yet"}
      description={
        scannedEmpty
          ? "We analyzed the codebase but didn't find a committed schema or SQLAlchemy/Django models."
          : "Analyze the codebase to detect database models and generate an ER diagram — your repository won't be modified."
      }
      actions={[
        {
          label: generate.isPending ? "Analyzing…" : scannedEmpty ? "Analyze again" : "Generate ER diagram",
          onClick: () => generate.mutate(),
          disabled: generate.isPending,
        },
      ]}
    />
  );
}

function CanvasLoading({ label }: { label: string }) {
  return (
    <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

/* ---------- pure helpers ---------- */

type TLayoutKind = "dashboard" | "graph" | "schema" | "metrics" | "issues";

/** Each view picks its own layout — Overview is the actionable dashboard (GIN-271,
 * no graph manipulation) unless the rollout flag is off, in which case it falls back
 * to the legacy graph workspace; Dependencies/Modules/Call Flow get the 3-panel
 * graph workspace; Schema, Metrics and Issues own the full width. */
function layoutForView(view: string): TLayoutKind {
  if (view === "overview") return isOverviewDashboardEnabled() ? "dashboard" : "graph";
  if (view === "schema") return "schema";
  if (view === "metrics") return "metrics";
  if (view === "issues") return "issues";
  return "graph";
}

function typedToVisible(
  nodes: CodeNode[],
  relations: { source: string; target: string }[],
): { visNodes: TVisibleNode[]; visEdges: TVisibleEdge[] } {
  const visNodes: TVisibleNode[] = nodes.map((n) => ({
    id: n.id,
    label: n.name,
    color: communityColor(n.module ?? n.type),
    size: n.type === "module" ? 40 : n.type === "api" || n.type === "table" ? 26 : 20,
    count: 1,
    module: n.module ?? n.type,
    isLeaf: true,
    realId: n.id,
    shape: nodeTypeMeta(n.type).shape,
  }));
  const visEdges: TVisibleEdge[] = relations.map((r) => ({ from: r.source, to: r.target }));
  return { visNodes, visEdges };
}

function findTreeNode(node: ICodeTreeNode, id: string): ICodeTreeNode | null {
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const hit = findTreeNode(c, id);
    if (hit) return hit;
  }
  return null;
}

const EMPTY_TRACE = {
  requirements: [],
  stories: [],
  sprints: [],
  prs: [],
  qc: [],
  deployments: [],
};

function resolveDetail(
  data: ICodebaseIntelligence,
  tree: TModuleTree | null,
  id: string | null,
  metrics: ICodeMetrics | null = null,
  realGraph: ICodeGraph | null = null,
): INodeInspectorDetail | null {
  if (!id) return null;

  // Everything below is derived from the real graph/tree. The fixture `details` map and
  // its typed-node fallback are gone (GIN-154/157): they supplied a coverage percentage
  // and a test count for files nobody measured.
  const rn = tree?.nodeById.get(id);
  if (rn) {
    const nb = tree!.adjacency.get(id) ?? [];
    const path = rn.source_file ? relPath(rn.source_file) : undefined;
    return {
      id,
      name: rn.label ?? id,
      type: kindToNodeType(rn.kind, rn.source_file),
      path,
      complexity: path ? fileComplexityFromMetrics(metrics, path) : undefined,
      inbound: nb.length,
      outbound: 0,
      apis: [],
      tests: 0,
      dependencies: nb.slice(0, 12).map((nid) => ({
        id: nid,
        name: tree!.nodeById.get(nid)?.label ?? nid,
        type: "file" as const,
      })),
      dependents: [],
      relatedTables: [],
      recentChanges: [],
      traceability: EMPTY_TRACE,
    };
  }

  const tn = data.tree ? findTreeNode(data.tree, id) : null;
  if (tn) {
    const isSubtree = tn.type === "folder" || tn.type === "repository" || tn.type === "module";
    return {
      id,
      name: tn.name,
      type: tn.type,
      path: tn.path,
      complexity: tn.path ? fileComplexityFromMetrics(metrics, tn.path) : undefined,
      inbound: 0,
      outbound: 0,
      apis: [],
      tests: 0,
      dependencies: [],
      dependents: [],
      relatedTables: [],
      recentChanges: [],
      aggregate:
        isSubtree && realGraph ? aggregateSubtree(realGraph, tn.path ?? "", metrics) : undefined,
      traceability: EMPTY_TRACE,
    };
  }

  return null;
}
