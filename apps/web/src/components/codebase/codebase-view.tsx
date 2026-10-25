"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  ancestorsToOpen,
  buildModuleTree,
  computeVisibleGraph,
  type TVisibleNode,
} from "@/lib/code/module-tree";
import { communityColor } from "@/lib/code/community-color";
import { useCodeGraph } from "@/hooks/code/use-code-graph";
import { useErSchema, useGenerateErSchema } from "@/hooks/code/use-erd";
import { useIndexStatus } from "@/hooks/code/use-index-status";
import { useAiPaneStore } from "@/store/ui/ai-pane.store";
import { EIndexStatus } from "@/types";

import { IndexStatusBanner } from "./index-status-banner";
import { MetricsTab } from "./metrics/metrics-tab";

const CodebaseGraph = dynamic(
  () => import("./codebase-graph").then((m) => m.CodebaseGraph),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center text-sm text-[#8888aa]">
        Loading graph…
      </div>
    ),
  },
);

// @xyflow/react is heavy and browser-only — load the ER canvas on demand.
const ErdCanvas = dynamic(() => import("@/components/ai/chat/erd-canvas").then((m) => m.ErdCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
      Loading schema…
    </div>
  ),
});

type TCodebaseTab = "graph" | "schema" | "metrics";

const TABS: { id: TCodebaseTab; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "schema", label: "Schema" },
  { id: "metrics", label: "Metrics" },
];

/** Up to 20 nodes whose label matches the query — feeds the sidebar search. */
function searchNodes(
  tree: ReturnType<typeof buildModuleTree> | null,
  query: string,
): { id: string; label: string; color: string }[] {
  const q = query.trim().toLowerCase();
  if (!q || !tree) return [];
  const out: { id: string; label: string; color: string }[] = [];
  for (const [id, n] of tree.nodeById) {
    const label = n.label ?? id;
    if (label.toLowerCase().includes(q)) {
      out.push({ id, label, color: communityColor(tree.moduleOf.get(id) ?? "root") });
      if (out.length >= 20) break;
    }
  }
  return out;
}

/**
 * Codebase route shell: index-staleness banner + a Graph/Metrics switcher. The
 * Graph tab is a graphify-style explorer — a force-directed graph that starts
 * collapsed to ~a dozen module super-nodes and drills down on click, beside a
 * dark sidebar (search · node info + neighbors · module legend). The dark
 * surface is a deliberate, self-contained "explorer" canvas (graphify's own
 * palette), not app chrome — hence the fixed hex colors rather than tokens.
 */
export function CodebaseView({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const [tab, setTab] = useState<TCodebaseTab>("graph");
  const { status } = useIndexStatus(workspaceSlug, projectId);
  const isReady = status === EIndexStatus.Ready;
  const { data: graph, isLoading, isError, refetch } = useCodeGraph(workspaceSlug, projectId, isReady);
  const { data: erSchema, isLoading: erLoading } = useErSchema(workspaceSlug, projectId, isReady && tab === "schema");

  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [hiddenModules, setHiddenModules] = useState<Set<string>>(new Set());
  const [selectedRealId, setSelectedRealId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const openAiPane = useAiPaneStore((s) => s.setOpen);

  // React Compiler memoizes these on their inputs — no hand-rolled useMemo.
  const tree = graph ? buildModuleTree(graph) : null;
  const visible = tree
    ? computeVisibleGraph(tree, openKeys, hiddenModules)
    : { nodes: [], edges: [] };

  const selectedNode = selectedRealId ? tree?.nodeById.get(selectedRealId) ?? null : null;
  const selectedRep = selectedRealId
    ? visible.nodes.find((n) => n.realId === selectedRealId)?.id ?? null
    : null;
  const neighbors = selectedRealId ? tree?.adjacency.get(selectedRealId) ?? [] : [];

  const searchMatches = searchNodes(tree, query);

  function toggleBucket(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function focusNode(realId: string) {
    if (!tree) return;
    const toOpen = ancestorsToOpen(tree, realId);
    // FP: three independent batched setState calls in an event handler; no updater
    // callback here is impure (`toOpen` computed above; `setOpenKeys` takes a plain Set).
    // eslint-disable-next-line react-doctor/no-impure-state-updater
    setSelectedRealId(realId);
    setQuery("");
    setOpenKeys(new Set([...openKeys, ...toOpen]));
  }

  function onNodeClick(node: TVisibleNode) {
    if (node.isLeaf && node.realId) setSelectedRealId(node.realId);
    else toggleBucket(node.id);
  }

  function reset() {
    setOpenKeys(new Set());
    setHiddenModules(new Set());
    setSelectedRealId(null);
    setQuery("");
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col p-6">
      {/* Single enterprise toolbar: view tabs on the left, contextual actions +
          index status on the right — no separate full-width banner strip. */}
      <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3">
        <div
          role="tablist"
          aria-label="Codebase view"
          className="inline-flex w-fit items-center gap-1 rounded-lg border bg-muted/40 p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {tab === "graph" && isReady && graph && graph.nodes.length > 0 ? (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                click a module to drill in
              </span>
              <button
                type="button"
                onClick={reset}
                disabled={openKeys.size === 0 && hiddenModules.size === 0 && !selectedRealId}
                className="rounded-md border px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                Reset view
              </button>
            </>
          ) : null}
          <IndexStatusBanner workspaceSlug={workspaceSlug} projectId={projectId} />
        </div>
      </div>

      {tab === "graph" ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          {!isReady ? (
            <EmptyState
              assetKey="generic"
              title="No codebase graph yet"
              description="Index this repo above to explore it as a dependency graph."
            />
          ) : isLoading ? (
            <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
              Loading graph…
            </div>
          ) : isError ? (
            <EmptyState
              assetKey="error"
              title="Couldn't load the codebase graph"
              description="Something went wrong fetching the graph. Please try again."
              actions={[{ label: "Retry", onClick: () => refetch() }]}
            />
          ) : graph && graph.nodes.length > 0 && tree ? (
            <div className="flex size-full bg-[#0f0f1a]">
              {/* graph canvas */}
              <div className="relative min-h-0 flex-1">
                <CodebaseGraph
                  nodes={visible.nodes}
                  edges={visible.edges}
                  selectedRep={selectedRep}
                  onNodeClick={onNodeClick}
                />
              </div>

              {/* graphify-style sidebar */}
              <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-[#2a2a4e] bg-[#1a1a2e] text-[#e0e0e0]">
                <div className="border-b border-[#2a2a4e] p-3">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search nodes…"
                    aria-label="Search codebase nodes"
                    className="w-full rounded-md border border-[#3a3a5e] bg-[#0f0f1a] px-2.5 py-1.5 text-[13px] text-[#e0e0e0] outline-none placeholder:text-[#666] focus:border-[#4E79A7]"
                  />
                  {searchMatches.length > 0 ? (
                    <div className="mt-2 max-h-40 overflow-y-auto">
                      {searchMatches.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => focusNode(m.id)}
                          style={{ borderLeftColor: m.color }}
                          className="block w-full truncate border-l-[3px] px-2 py-1 text-left text-xs hover:bg-[#2a2a4e]"
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="border-b border-[#2a2a4e] p-3.5">
                  <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[#8888aa]">
                    Node Info
                  </h3>
                  {selectedNode ? (
                    <div className="space-y-1.5 text-[13px] leading-relaxed text-[#ccc]">
                      <div className="wrap-anywhere font-semibold text-[#e0e0e0]">
                        {selectedNode.label ?? selectedRealId}
                      </div>
                      {selectedNode.kind ? <div>Type: {selectedNode.kind}</div> : null}
                      {selectedNode.source_file ? (
                        <div className="wrap-anywhere font-mono text-[11px] text-[#8888aa]">
                          {selectedNode.source_file}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openAiPane(true)}
                        className="mt-1 rounded-md bg-[#4E79A7] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
                      >
                        Ask GigsAI about this
                      </button>
                      {neighbors.length > 0 ? (
                        <div className="pt-1">
                          <div className="mb-1 text-[11px] text-[#8888aa]">
                            Neighbors ({neighbors.length})
                          </div>
                          <div className="max-h-40 space-y-0.5 overflow-y-auto">
                            {neighbors.map((nid) => {
                              const nb = tree.nodeById.get(nid);
                              const color = communityColor(tree.moduleOf.get(nid) ?? "root");
                              return (
                                <button
                                  key={nid}
                                  type="button"
                                  onClick={() => focusNode(nid)}
                                  style={{ borderLeftColor: color }}
                                  className="block w-full truncate border-l-[3px] px-1.5 py-0.5 text-left text-xs hover:bg-[#2a2a4e]"
                                >
                                  {nb?.label ?? nid}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[13px] italic text-[#555]">Click a node to inspect it</p>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-[#8888aa]">
                    Modules
                  </h3>
                  {tree.modules.map((m) => {
                    const dimmed = hiddenModules.has(m.key);
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() =>
                          setHiddenModules((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.key)) next.delete(m.key);
                            else next.add(m.key);
                            return next;
                          })
                        }
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-[#2a2a4e]",
                          dimmed && "opacity-35",
                        )}
                      >
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ background: m.color }}
                        />
                        <span className="flex-1 truncate">{m.label}</span>
                        <span className="text-[11px] text-[#666]">{m.count}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-[#2a2a4e] px-3.5 py-2.5 text-[11px] text-[#555]">
                  {visible.nodes.length} shown · {graph.nodes.length} nodes · {tree.modules.length}{" "}
                  modules
                </div>
              </aside>
            </div>
          ) : (
            <EmptyState
              assetKey="generic"
              title="Nothing indexed yet"
              description="This project's codebase graph is empty."
            />
          )}
        </div>
      ) : tab === "schema" ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border p-4">
          {!isReady ? (
            <EmptyState
              assetKey="generic"
              title="No schema yet"
              description="Index this repo above to extract its data model."
            />
          ) : erLoading ? (
            <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
              Loading schema…
            </div>
          ) : erSchema && erSchema.tables.length > 0 ? (
            <ErdCanvas schema={erSchema} fill />
          ) : (
            <SchemaEmptyState workspaceSlug={workspaceSlug} projectId={projectId} />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <MetricsTab workspaceSlug={workspaceSlug} projectId={projectId} />
        </div>
      )}
    </div>
  );
}

/**
 * Schema-tab empty state (GIN-86): a button analyzes the codebase, detects DB
 * models (committed .dbml/Prisma or SQLAlchemy/Django classes), and generates the
 * ER diagram on demand — the repo is never modified. On success the schema primes
 * the canvas; if nothing is found, it offers GigsAI as a fallback.
 */
function SchemaEmptyState({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const generate = useGenerateErSchema(workspaceSlug, projectId);
  const openAiPane = useAiPaneStore((s) => s.setOpen);
  const scannedEmpty = generate.isSuccess && generate.data.tables.length === 0;

  if (scannedEmpty) {
    return (
      <EmptyState
        assetKey="generic"
        title="No database models found"
        description="We analyzed the codebase but didn't find a committed schema or SQLAlchemy/Django models. You can ask GigsAI to draft a data model instead."
        actions={[
          { label: "Ask GigsAI", onClick: () => openAiPane(true) },
          {
            label: "Analyze again",
            onClick: () => generate.mutate(),
            disabled: generate.isPending,
          },
        ]}
      />
    );
  }

  return (
    <EmptyState
      assetKey="generic"
      title="No data model yet"
      description="Analyze the codebase to detect database models and generate an ER diagram — your repository won't be modified."
      actions={[
        {
          label: generate.isPending ? "Analyzing…" : "Generate ER diagram",
          onClick: () => generate.mutate(),
          disabled: generate.isPending,
        },
      ]}
    />
  );
}
