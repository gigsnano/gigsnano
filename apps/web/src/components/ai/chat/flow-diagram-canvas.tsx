"use client";

import { useEffect, useRef } from "react";
import { DataSet, Network } from "vis-network/standalone";

import type { IFlowArtifact, IFlowNode } from "@/lib/code/flow-artifact";
import { DEFAULT_HUE, KIND_HUE } from "./flow-diagram-style";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * The vis-network canvas for a flow artifact (GIN-314). Split out and mounted
 * client-only via `next/dynamic({ ssr: false })` so the heavy graph dependency
 * stays out of the SSR bundle and never loads for a plain chat reply. Hierarchical
 * layout, kind-colored nodes, directed edges; selecting a node bubbles it up.
 */
export default function FlowDiagramCanvas({
  flow,
  onSelect,
  fitToken,
}: {
  flow: IFlowArtifact;
  onSelect: (node: IFlowNode | null) => void;
  /** Bumped by the parent's Fit button to re-fit the view. */
  fitToken: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  const signature = `${flow.id}:${flow.nodes.length}:${flow.edges.length}:${flow.direction}`;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;
    const isDark = document.documentElement.classList.contains("dark");

    const nodes = new DataSet(
      flow.nodes.map((n) => {
        const hue = n.kind ? KIND_HUE[n.kind] : DEFAULT_HUE;
        return {
          id: n.id,
          label: n.label,
          title: n.summary ?? n.label,
          shape: n.kind === "decision" ? "diamond" : n.kind === "database" ? "database" : "box",
          color: {
            background: isDark ? `${hue}33` : `${hue}22`,
            border: hue,
            highlight: { background: `${hue}55`, border: hue },
          },
        };
      }),
    );
    const edges = new DataSet(
      flow.edges.map((e) => ({
        id: e.id,
        from: e.source,
        to: e.target,
        label: e.label,
        dashes: e.kind === "async" || e.kind === "error",
        color: { color: e.kind === "error" ? "#ef4444" : isDark ? "#4a4a5e" : "#cbcbd6" },
      })),
    );

    const network = new Network(
      container,
      { nodes, edges },
      {
        layout: {
          hierarchical: {
            enabled: true,
            direction: flow.direction === "LR" ? "LR" : "UD",
            sortMethod: "directed",
            levelSeparation: 120,
            nodeSpacing: 130,
          },
        },
        physics: { enabled: false },
        interaction: { hover: true, tooltipDelay: 150, keyboard: false },
        nodes: {
          borderWidth: 1.5,
          font: { size: 12, color: isDark ? "#d4d4d8" : "#3f3f46" },
          margin: { top: 8, right: 10, bottom: 8, left: 10 },
          widthConstraint: { maximum: 160 },
          shapeProperties: { borderRadius: 6 },
        },
        edges: {
          smooth: { enabled: true, type: "cubicBezier", roundness: 0.5 },
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          font: { size: 10, color: isDark ? "#a1a1aa" : "#71717a", strokeWidth: 0 },
        },
      },
    );
    networkRef.current = network;

    const byId = new Map(flow.nodes.map((n) => [n.id, n]));
    const handleSelect = (p: { nodes: (string | number)[] }) => {
      const id = p.nodes[0];
      onSelectRef.current(id != null ? (byId.get(String(id)) ?? null) : null);
    };
    const handleDeselect = () => onSelectRef.current(null);
    const handleAfterDraw = () => {
      try {
        network.fit({
          animation: prefersReducedMotion() ? false : { duration: 300, easingFunction: "easeInOutQuad" },
        });
      } catch {
        /* fit before first layout is a no-op */
      }
    };
    network.on("selectNode", handleSelect);
    network.on("deselectNode", handleDeselect);
    network.once("afterDrawing", handleAfterDraw);

    return () => {
      network.off("selectNode", handleSelect);
      network.off("deselectNode", handleDeselect);
      network.destroy();
      networkRef.current = null;
    };
    // eslint-disable-next-line react-doctor/exhaustive-deps -- signature captures the flow identity
  }, [signature]);

  // Re-fit when the parent's Fit button bumps the token (imperative canvas op).
  useEffect(() => {
    if (fitToken === 0) return;
    try {
      networkRef.current?.fit({
        animation: prefersReducedMotion() ? false : { duration: 250, easingFunction: "easeInOutQuad" },
      });
    } catch {
      /* no network yet */
    }
  }, [fitToken]);

  return (
    <div
      ref={containerRef}
      className="h-72 w-full bg-muted/20"
      role="img"
      aria-label={`Flow diagram: ${flow.title}`}
    />
  );
}
