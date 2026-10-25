import type { TFlowNodeKind } from "@/lib/code/flow-artifact";

/**
 * Node-kind visual vocabulary (GIN-314), shared by the canvas and the legend.
 * Kept free of vis-network so it stays in the SSR bundle while the canvas that
 * uses it is loaded client-only via next/dynamic. Never color-only — the label
 * and legend carry the meaning too.
 */
export const KIND_HUE: Record<TFlowNodeKind, string> = {
  external: "#a1a1aa",
  frontend: "#6366f1",
  service: "#0ea5e9",
  api: "#8b5cf6",
  database: "#10b981",
  queue: "#f59e0b",
  decision: "#eab308",
  process: "#64748b",
};

export const DEFAULT_HUE = "#64748b";

export const KIND_LABEL: Record<TFlowNodeKind, string> = {
  external: "External",
  frontend: "Frontend",
  service: "Service",
  api: "API",
  database: "Database",
  queue: "Queue",
  decision: "Decision",
  process: "Process",
};
