"use client";

import { useEffect, useRef } from "react";
import { DataSet, Network } from "vis-network/standalone";
import type { Options } from "vis-network/standalone";

import type { TVisibleEdge, TVisibleNode } from "@/lib/code/module-tree";
import type { ERiskLevel } from "@/types/code/intelligence";

// graphify's graph.html recipe: forceAtlas2Based physics that freezes once
// settled (snappy drag, no jiggle), hidden node labels with hover tooltips,
// draggable nodes.
//
// The "a few dozen nodes so it's all cheap" assumption this was written under
// only ever held for nodes. capOpenKeys caps the frontier at MAX_VISIBLE_NODES
// (120); edges are deduped but NOT capped, so up to ~7k unique edges can reach
// vis-network on a dense repo — which is what made zoom and pan jerk (GIN-121).
// Hence smooth:false + hideEdgesOnZoom below: the edge count is the cost.
const OPTIONS: Options = {
  physics: {
    enabled: true,
    solver: "forceAtlas2Based",
    forceAtlas2Based: {
      gravitationalConstant: -80,
      centralGravity: 0.01,
      springLength: 110,
      springConstant: 0.08,
      damping: 0.4,
      avoidOverlap: 0.6,
    },
    stabilization: false,
    adaptiveTimestep: true,
  },
  interaction: {
    hover: true,
    tooltipDelay: 120,
    hideEdgesOnDrag: true,
    // Zoom is a continuous stream of redraws, and edges dominate the redraw at
    // this frontier's edge count. Dropping them for the duration of the gesture
    // is vis-network's own answer to a jerky wheel-zoom (GIN-121).
    hideEdgesOnZoom: true,
    keyboard: false,
  },
  // Labeled nodes (readable at the visible-frontier sizes we feed) + directional
  // arrows so imports/calls read as dependencies, not just lines.
  nodes: {
    shape: "box",
    borderWidth: 1.5,
    font: { size: 11, color: "#c9c9d4", strokeWidth: 3, strokeColor: "#0f0f1a", face: "inherit", multi: false, align: "center" },
    margin: { top: 8, right: 8, bottom: 8, left: 8 },
    widthConstraint: { minimum: 70, maximum: 150 },
    shapeProperties: { borderRadius: 6 },
  },
  edges: {
    // Straight, not curved. A continuous-smooth edge recomputes its bezier
    // support points on every redraw; at thousands of edges that is the single
    // biggest cost in a pan or zoom, and it bought nothing legible — curves in a
    // dense hairball read worse than straight lines, not better (GIN-121).
    smooth: false,
    color: { color: "#5a5a6e", highlight: "#ffffff", hover: "#a0a0b8" },
    arrows: { to: { enabled: true, scaleFactor: 0.5 } },
    selectionWidth: 3,
  },
};

interface VisNode {
  id: string;
  label: string;
  title: string;
  size: number;
  shape: string;
  risk?: ERiskLevel;
  color: { background: string; border: string; highlight: { background: string; border: string } };
}

/** Risk-tinted border: high/medium risk overrides the module hue so hotspots
 * read at a glance; everything else keeps its community color. */
function borderFor(risk: ERiskLevel | undefined, hue: string): string {
  return risk === "high" ? "#ef4444" : risk === "medium" ? "#f59e0b" : hue;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** hex → rgba so a non-neighbour keeps its hue but fades back on selection. */
function fade(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r || 0}, ${g || 0}, ${b || 0}, ${a})`;
}

/**
 * Interactive codebase graph on vis-network, graphify-style: community-colored
 * draggable dots, hover tooltips, physics that freezes once settled. Renders
 * only the passed visible frontier — the parent aggregates the full graph into
 * module super-nodes and expands on click, so this never sees thousands of
 * nodes. Client-only; mount via `next/dynamic(..., { ssr: false })`.
 */
export function CodebaseGraph({
  nodes,
  edges,
  selectedRep,
  onNodeClick,
  layout = "force",
}: {
  nodes: TVisibleNode[];
  edges: TVisibleEdge[];
  selectedRep: string | null;
  onNodeClick: (node: TVisibleNode) => void;
  layout?: "force" | "layered" | "sequence";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDsRef = useRef<DataSet<VisNode> | null>(null);
  const baseColorsRef = useRef<Map<string, string>>(new Map());
  const baseBordersRef = useRef<Map<string, string>>(new Map());
  const freezeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // latest props read inside stable listeners / signature-gated effect
  const nodesRef = useRef(nodes);
  const onClickRef = useRef(onNodeClick);
  useEffect(() => {
    nodesRef.current = nodes;
    onClickRef.current = onNodeClick;
  });

  // Build the network once; listeners read latest props via refs.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;

    const network = new Network(container, { nodes: [], edges: [] }, OPTIONS);
    networkRef.current = network;

    // Theme-aware chrome: the canvas is a token surface (not a black void), so
    // labels/edges must adapt to light/dark rather than assume a dark backdrop.
    const isDark = document.documentElement.classList.contains("dark");
    network.setOptions({
      nodes: {
        font: {
          color: isDark ? "#d4d4d8" : "#3f3f46",
          strokeColor: isDark ? "#0b0b12" : "#ffffff",
        },
      },
      edges: {
        color: {
          color: isDark ? "#4a4a5e" : "#cbcbd6",
          highlight: isDark ? "#ffffff" : "#6366f1",
          hover: isDark ? "#a0a0b8" : "#9494a8",
        },
      },
    });

    const onClick = (params: { nodes: (string | number)[] }) => {
      const id = params.nodes[0];
      if (id == null) return;
      const node = nodesRef.current.find((n) => n.id === String(id));
      if (node) onClickRef.current(node);
    };
    const onHover = () => {
      container.style.cursor = "pointer";
    };
    const onBlur = () => {
      container.style.cursor = "default";
    };
    // Dim everything except the selected node + its direct neighbours, so a
    // selection reads as a focused sub-graph rather than one highlighted dot.
    const dim = (id: string) => {
      const ds = nodesDsRef.current;
      if (!ds) return;
      const near = new Set(network.getConnectedNodes(id) as string[]);
      near.add(id);
      ds.update(
        [...baseColorsRef.current].map(([nid, base]) => {
          const border = baseBordersRef.current.get(nid) ?? base;
          return {
            id: nid,
            color: near.has(nid)
              ? { background: base, border, highlight: { background: "#ffffff", border } }
              : { background: fade(base, 0.16), border: fade(border, 0.22) },
          };
        }),
      );
    };
    const restore = () => {
      const ds = nodesDsRef.current;
      if (!ds) return;
      ds.update(
        [...baseColorsRef.current].map(([nid, base]) => {
          const border = baseBordersRef.current.get(nid) ?? base;
          return {
            id: nid,
            color: { background: base, border, highlight: { background: "#ffffff", border } },
          };
        }),
      );
    };
    const onSelectNode = (p: { nodes: (string | number)[] }) => {
      if (p.nodes[0] != null) dim(String(p.nodes[0]));
    };

    network.on("click", onClick);
    network.on("hoverNode", onHover);
    network.on("blurNode", onBlur);
    network.on("selectNode", onSelectNode);
    network.on("deselectNode", restore);

    return () => {
      network.off("click", onClick);
      network.off("hoverNode", onHover);
      network.off("blurNode", onBlur);
      network.off("selectNode", onSelectNode);
      network.off("deselectNode", restore);
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
      network.destroy();
      networkRef.current = null;
    };
  }, []);

  // Re-feed data whenever the visible frontier changes (expand / collapse /
  // filter). Gate on a cheap signature so a same-shape re-render is a no-op.
  const signature = `${nodes.map((n) => n.id).join("|")}#${edges.length}`;
  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;

    const baseColors = new Map<string, string>();
    const baseBorders = new Map<string, string>();
    const visNodes = new DataSet<VisNode>(
      nodes.map((n) => {
        baseColors.set(n.id, n.color);
        const border = borderFor(n.risk, n.color);
        baseBorders.set(n.id, border);
        return {
          id: n.id,
          label: n.label,
          title: n.label,
          size: n.size,
          shape: n.shape ?? "box",
          risk: n.risk,
          color: {
            background: fade(n.color, 0.18),
            border,
            highlight: { background: fade(n.color, 0.3), border },
          },
        };
      }),
    );
    nodesDsRef.current = visNodes;
    baseColorsRef.current = baseColors;
    baseBordersRef.current = baseBorders;
    const visEdges = new DataSet(edges.map((e, i) => ({ id: i, from: e.from, to: e.to })));
    network.setData({ nodes: visNodes, edges: visEdges });

    network.setOptions({ physics: { enabled: true } });
    // Freeze once settled AND fit the frame so a handful of nodes fill the view
    // instead of floating as specks in an empty canvas.
    const freeze = () => {
      network.setOptions({ physics: { enabled: false } });
      try {
        network.fit({
          animation: prefersReducedMotion() ? false : { duration: 350, easingFunction: "easeInOutQuad" },
        });
      } catch {
        /* fit before first layout is a no-op */
      }
    };
    network.once("stabilized", freeze);
    if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
    freezeTimerRef.current = setTimeout(freeze, 2500);
    return () => {
      network.off("stabilized", freeze);
      if (freezeTimerRef.current) clearTimeout(freezeTimerRef.current);
      freezeTimerRef.current = null;
    };
    // eslint-disable-next-line react-doctor/exhaustive-deps -- signature captures nodes/edges
  }, [signature]);

  // Reflect selection: highlight + focus the selected visible node.
  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;
    if (selectedRep && nodes.some((n) => n.id === selectedRep)) {
      try {
        network.selectNodes([selectedRep]);
        network.focus(selectedRep, {
          scale: 1.2,
          animation: prefersReducedMotion() ? false : { duration: 500, easingFunction: "easeInOutQuad" },
        });
      } catch {
        network.unselectAll();
      }
    } else {
      network.unselectAll();
    }
    // eslint-disable-next-line react-doctor/exhaustive-deps -- re-run on selection or frontier change
  }, [selectedRep, signature]);

  // Apply the chosen layout (force vs hierarchical). Re-run on data change too so
  // a freshly-fed frontier keeps the selected layout.
  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;
    const hierarchical = layout === "layered" || layout === "sequence";
    network.setOptions({
      layout: hierarchical
        ? {
            hierarchical: {
              enabled: true,
              direction: layout === "sequence" ? "LR" : "UD",
              sortMethod: "directed",
              levelSeparation: 130,
              nodeSpacing: 100,
            },
          }
        : { hierarchical: { enabled: false } },
      physics: { enabled: !hierarchical },
    });
    try {
      network.fit({
        animation: prefersReducedMotion() ? false : { duration: 300, easingFunction: "easeInOutQuad" },
      });
    } catch {
      /* fit before first layout is a no-op */
    }
    // eslint-disable-next-line react-doctor/exhaustive-deps -- re-apply on layout or frontier change
  }, [layout, signature]);

  return <div ref={containerRef} className="size-full" role="img" aria-label="Codebase dependency graph" />;
}
