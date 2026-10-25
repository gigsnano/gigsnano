"use client";

import { useState } from "react";
import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowExpand01Icon, ArrowShrink01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { directNeighbors } from "@/lib/erd/fk-tree";
import type { IErdSchema, IErdTable } from "@/types";
import { ErdTableNode, ERD_COLLAPSED_COLUMNS, type IErdTableNodeData } from "./erd-table-node";
import { ErdRelationshipEdge } from "./erd-relationship-edge";
import { ErdDetailsPanel } from "./erd-details-panel";

// Module-level (stable references) — React Flow re-instantiates node/edge types
// on every render otherwise, and react-doctor/react-flow both require this.
const nodeTypes = { table: ErdTableNode };
const edgeTypes = { relationship: ErdRelationshipEdge };

const NODE_WIDTH = 200;
const ROW_HEIGHT = 24;
const HEADER_HEIGHT = 32;

function tableHeight(columnCount: number): number {
  return HEADER_HEIGHT + Math.max(columnCount, 1) * ROW_HEIGHT;
}

export type TArrangeMode = "horizontal" | "vertical" | "grid";

/** Simple grid placement — for schemas where the FK graph gives no useful flow. */
function gridLayout(schema: IErdSchema): Map<string, { x: number; y: number }> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(schema.tables.length)));
  const colW = NODE_WIDTH + 70;
  const rowH = Math.max(...schema.tables.map((t) => tableHeight(t.columns.length)), HEADER_HEIGHT) + 50;
  return new Map(
    schema.tables.map((t, i) => [
      t.name,
      { x: (i % cols) * colW, y: Math.floor(i / cols) * rowH },
    ]),
  );
}

/** Position ER tables by mode: dagre flow (horizontal LR / vertical TB) or a grid. */
function layoutErd(schema: IErdSchema, mode: TArrangeMode): Map<string, { x: number; y: number }> {
  if (mode === "grid") return gridLayout(schema);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: mode === "vertical" ? "TB" : "LR", nodesep: 50, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const t of schema.tables) g.setNode(t.name, { width: NODE_WIDTH, height: tableHeight(t.columns.length) });
  for (const r of schema.relations) g.setEdge(r.from_table, r.to_table);

  dagre.layout(g);

  return new Map(
    schema.tables.map((t) => {
      const pos = g.node(t.name);
      const height = tableHeight(t.columns.length);
      return [t.name, { x: pos.x - NODE_WIDTH / 2, y: pos.y - height / 2 }];
    }),
  );
}

/** Entry point — the ReactFlowProvider lets the sidebar/list drive the canvas
 *  (fitView/zoom) from outside the <ReactFlow> subtree. */
export function ErdCanvas({ schema, fill = false }: { schema: IErdSchema; fill?: boolean }) {
  return (
    <ReactFlowProvider>
      <ErdCanvasInner schema={schema} fill={fill} />
    </ReactFlowProvider>
  );
}

function ErdCanvasInner({ schema, fill }: { schema: IErdSchema; fill: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [arrange, setArrange] = useState<TArrangeMode>("horizontal");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { fitView } = useReactFlow();

  const byName = new Map(schema.tables.map((t) => [t.name, t]));
  // Hover previews a table's neighbors (Liam-style); a click-selected table stays
  // highlighted while nothing is hovered so its details panel keeps context.
  const focusName = hovered ?? selected;
  const highlighted = focusName ? directNeighbors(schema, focusName) : null;
  const selectedTable = selected ? byName.get(selected) ?? null : null;

  const select = (name: string) => setSelected((cur) => (cur === name ? null : name));

  const toggleCollapse = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  // Global shrink/expand: only tables past the column threshold can collapse.
  const collapsibleNames = schema.tables
    .filter((t) => t.columns.length > ERD_COLLAPSED_COLUMNS)
    .map((t) => t.name);
  const allCollapsed = collapsibleNames.length > 0 && collapsibleNames.every((n) => collapsed.has(n));
  const toggleAllCollapsed = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(collapsibleNames));

  // Positions live in React Flow state so nodes stay where the user drags them;
  // highlight/select state is injected fresh at render (derived, not stored).
  const initialPositions = layoutErd(schema, "horizontal");
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<IErdTableNodeData>>(
    schema.tables.map((t) => ({
      id: t.name,
      type: "table",
      position: initialPositions.get(t.name) ?? { x: 0, y: 0 },
      data: {} as IErdTableNodeData,
    })),
  );

  // Re-flow all tables to a new arrangement, then re-fit the viewport.
  const applyArrange = (mode: TArrangeMode) => {
    setArrange(mode);
    const pos = layoutErd(schema, mode);
    setRfNodes((ns) => ns.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    // Defer the fit until React Flow has the new positions.
    setTimeout(() => fitView({ duration: 400, padding: 0.15 }), 60);
  };

  const nodes: Node<IErdTableNodeData>[] = rfNodes.map((n) => ({
    ...n,
    data: {
      table: byName.get(n.id)!,
      dimmed: highlighted ? !highlighted.has(n.id) : false,
      selected: selected === n.id,
      glow: selected === n.id || Boolean(highlighted?.has(n.id)),
      collapsed: collapsed.has(n.id),
      onSelect: select,
      onToggleCollapse: toggleCollapse,
    },
  }));

  const edges: Edge[] = schema.relations.map((r) => ({
    id: `${r.from_table}.${r.from_column}->${r.to_table}.${r.to_column}`,
    source: r.from_table,
    target: r.to_table,
    type: "relationship",
    data: { active: Boolean(highlighted?.has(r.from_table) && highlighted?.has(r.to_table)) },
  }));

  // Spotlight: select the table and fly the viewport to center it.
  const focusTable = (name: string) => {
    setSelected(name);
    fitView({ nodes: [{ id: name }], duration: 400, maxZoom: 1.2, padding: 0.4 });
  };

  return (
    <div
      className={cn(
        "relative flex w-full overflow-hidden rounded-lg border bg-muted/30",
        fill ? "h-full" : "mt-2 h-80",
      )}
    >
      {fill ? (
        <ErdTableList
          tables={schema.tables}
          query={query}
          onQuery={setQuery}
          selected={selected}
          onPick={focusTable}
        />
      ) : null}

      <div className="relative min-w-0 flex-1">
        {/* Flow-particle gradient (comet fade) — defined once, referenced by every
            active relationship edge via url(#erd-flow-gradient). */}
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <linearGradient id="erd-flow-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
              <stop offset="50%" stopColor="#10b981" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeMouseEnter={(_, node) => setHovered(node.id)}
          onNodeMouseLeave={() => setHovered(null)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.1}
          nodesConnectable={false}
          edgesFocusable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <ErdControlBar
            arrange={arrange}
            onArrange={applyArrange}
            allCollapsed={allCollapsed}
            onToggleAllCollapsed={toggleAllCollapsed}
          />
          {schema.based_on_sha ? (
            <Panel position="top-right">
              <span className="rounded bg-card/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
                based on {schema.based_on_sha.slice(0, 7)}
              </span>
            </Panel>
          ) : null}
        </ReactFlow>

        {selectedTable ? (
          <ErdDetailsPanel
            table={selectedTable}
            schema={schema}
            onSelectTable={setSelected}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>
    </div>
  );
}

const ARRANGE_LABELS: Record<TArrangeMode, string> = {
  horizontal: "Horizontal",
  vertical: "Vertical",
  grid: "Grid",
};

/** Liam-style floating control pill (bottom-center): zoom, fit, auto-arrange,
 *  and a global shrink/expand toggle. */
function ErdControlBar({
  arrange,
  onArrange,
  allCollapsed,
  onToggleAllCollapsed,
}: {
  arrange: TArrangeMode;
  onArrange: (mode: TArrangeMode) => void;
  allCollapsed: boolean;
  onToggleAllCollapsed: () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);

  return (
    <Panel position="bottom-center">
      <div className="flex items-center gap-0.5 rounded-full border bg-card/95 p-1 shadow-lg backdrop-blur">
        <ControlButton label="Zoom out" onClick={() => zoomOut({ duration: 150 })}>
          <span className="text-base leading-none">−</span>
        </ControlButton>
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <ControlButton label="Zoom in" onClick={() => zoomIn({ duration: 150 })}>
          <span className="text-base leading-none">+</span>
        </ControlButton>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <ControlButton label="Fit view" onClick={() => fitView({ duration: 300, padding: 0.2 })}>
          <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
        </ControlButton>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={onToggleAllCollapsed}
          className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={allCollapsed ? "Expand all columns" : "Collapse all columns"}
        >
          <HugeiconsIcon
            icon={ArrowShrink01Icon}
            className={cn("size-3.5", allCollapsed && "rotate-180")}
          />
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Auto-arrange tables"
              title="Auto-arrange"
              className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {ARRANGE_LABELS[arrange]}
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-36">
            {(Object.keys(ARRANGE_LABELS) as TArrangeMode[]).map((mode) => (
              <DropdownMenuItem key={mode} onSelect={() => onArrange(mode)}>
                <span className="flex-1">{ARRANGE_LABELS[mode]}</span>
                {mode === arrange ? <span className="text-xs text-primary">●</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Panel>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.95]"
    >
      {children}
    </button>
  );
}

/** Searchable table list — click to spotlight/focus a table on the canvas. */
function ErdTableList({
  tables,
  query,
  onQuery,
  selected,
  onPick,
}: {
  tables: IErdTable[];
  query: string;
  onQuery: (q: string) => void;
  selected: string | null;
  onPick: (name: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q ? tables.filter((t) => t.name.toLowerCase().includes(q)) : tables;

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r bg-card">
      <div className="border-b p-2">
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search tables…"
          aria-label="Search tables"
          className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">No tables match.</p>
        ) : (
          filtered.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => onPick(t.name)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent/50",
                selected === t.name && "bg-accent font-medium text-accent-foreground",
              )}
            >
              <span className="truncate">{t.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{t.columns.length}</span>
            </button>
          ))
        )}
      </div>
      <div className="border-t px-2 py-1 text-[10px] text-muted-foreground">{tables.length} tables</div>
    </aside>
  );
}
