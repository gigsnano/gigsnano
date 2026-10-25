/**
 * Flow-artifact schema + validator (GIN-314).
 *
 * Ask Code Intelligence emits a structured `kind: "flow"` JSON payload for
 * architecture/call/API/data-flow questions. The chat used to print it as a raw
 * JSON code block; the renderer now detects a valid flow artifact and draws it.
 *
 * This module is the single source of truth for what a *valid* flow is — a
 * versioned, bounded, self-consistent graph. Detection is deliberately strict so
 * ordinary JSON / Markdown / non-flow code fences are never misclassified as a
 * diagram (a core regression the ticket calls out).
 */

export const FLOW_SCHEMA_VERSION = "1" as const;

// Bounds keep a hostile or runaway payload from locking up layout / the tab.
const MAX_NODES = 200;
const MAX_EDGES = 400;
const MAX_LABEL = 120;
const MAX_SUMMARY = 600;

export const FLOW_NODE_KINDS = [
  "external",
  "frontend",
  "service",
  "api",
  "database",
  "queue",
  "decision",
  "process",
] as const;
export type TFlowNodeKind = (typeof FLOW_NODE_KINDS)[number];

export const FLOW_EDGE_KINDS = ["sync", "async", "data", "dependency", "error"] as const;
export type TFlowEdgeKind = (typeof FLOW_EDGE_KINDS)[number];

export interface IFlowFileRef {
  path: string;
  line?: number;
}

export interface IFlowNode {
  id: string;
  label: string;
  kind?: TFlowNodeKind;
  summary?: string;
  fileRefs?: IFlowFileRef[];
}

export interface IFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: TFlowEdgeKind;
}

export interface IFlowArtifact {
  id: string;
  kind: "flow";
  schemaVersion: string;
  title: string;
  direction: "TB" | "LR";
  nodes: IFlowNode[];
  edges: IFlowEdge[];
}

export type TFlowParse =
  | { ok: true; flow: IFlowArtifact }
  | { ok: false; reason: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Quick, allocation-free gate: does this text even look like a flow artifact?
 * Used to skip JSON.parse on the overwhelmingly-common non-flow code fence.
 */
export function looksLikeFlow(text: string): boolean {
  return /"kind"\s*:\s*"flow"/.test(text) || /"artifactType"\s*:\s*"flow"/.test(text);
}

/**
 * Parse + validate a candidate flow payload. Accepts the streamed top-level
 * `{ kind: "flow", ... }` shape and the `{ artifactType: "flow", payload: {...} }`
 * wrapper. Returns a normalized artifact or a safe, user-actionable reason.
 */
export function parseFlowArtifact(text: string): TFlowParse {
  if (!looksLikeFlow(text)) return { ok: false, reason: "Not a flow artifact." };

  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    return { ok: false, reason: "Flow payload is not valid JSON." };
  }
  if (!isRecord(raw)) return { ok: false, reason: "Flow payload must be an object." };

  // Unwrap the typed-artifact-part envelope if present.
  const body = raw.artifactType === "flow" && isRecord(raw.payload) ? raw.payload : raw;
  const kindOk = raw.kind === "flow" || raw.artifactType === "flow";
  if (!kindOk) return { ok: false, reason: "Not a flow artifact." };

  const version = str(raw.schemaVersion) ?? str(body.schemaVersion) ?? FLOW_SCHEMA_VERSION;
  if (version !== FLOW_SCHEMA_VERSION) {
    return { ok: false, reason: `Unsupported flow schema version "${version}".` };
  }

  const rawNodes = body.nodes;
  const rawEdges = body.edges ?? [];
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    return { ok: false, reason: "Flow has no nodes." };
  }
  if (!Array.isArray(rawEdges)) return { ok: false, reason: "Flow edges must be a list." };
  if (rawNodes.length > MAX_NODES) return { ok: false, reason: `Too many nodes (>${MAX_NODES}).` };
  if (rawEdges.length > MAX_EDGES) return { ok: false, reason: `Too many edges (>${MAX_EDGES}).` };

  const nodes: IFlowNode[] = [];
  const ids = new Set<string>();
  for (const n of rawNodes) {
    if (!isRecord(n)) return { ok: false, reason: "A node is not an object." };
    const id = str(n.id);
    const label = str(n.label);
    if (!id) return { ok: false, reason: "A node is missing an id." };
    if (!label) return { ok: false, reason: `Node "${id}" is missing a label.` };
    if (ids.has(id)) return { ok: false, reason: `Duplicate node id "${id}".` };
    ids.add(id);
    const kind = str(n.kind);
    nodes.push({
      id,
      label: label.slice(0, MAX_LABEL),
      kind: (FLOW_NODE_KINDS as readonly string[]).includes(kind ?? "")
        ? (kind as TFlowNodeKind)
        : undefined,
      summary: str(n.summary)?.slice(0, MAX_SUMMARY),
      fileRefs: parseFileRefs(n.fileRefs),
    });
  }

  const edges: IFlowEdge[] = [];
  const edgeIds = new Set<string>();
  rawEdges.forEach((e, i) => {
    if (!isRecord(e)) return;
    const source = str(e.source) ?? str(e.from);
    const target = str(e.target) ?? str(e.to);
    if (!source || !target) return; // drop unroutable edges rather than fail the whole flow
    if (!ids.has(source) || !ids.has(target)) return; // edge references a missing node → skip
    let id = str(e.id) ?? `${source}->${target}`;
    while (edgeIds.has(id)) id = `${id}#${i}`;
    edgeIds.add(id);
    const kind = str(e.kind);
    edges.push({
      id,
      source,
      target,
      label: str(e.label)?.slice(0, MAX_LABEL),
      kind: (FLOW_EDGE_KINDS as readonly string[]).includes(kind ?? "")
        ? (kind as TFlowEdgeKind)
        : undefined,
    });
  });

  const direction = raw.direction === "LR" || body.direction === "LR" ? "LR" : "TB";

  return {
    ok: true,
    flow: {
      id: str(raw.id) ?? str(body.id) ?? "flow",
      kind: "flow",
      schemaVersion: FLOW_SCHEMA_VERSION,
      title: str(raw.title) ?? str(body.title) ?? "Flow",
      direction,
      nodes,
      edges,
    },
  };
}

/** Only http(s) file refs or plain repo paths — never javascript:/data: URLs. */
function parseFileRefs(raw: unknown): IFlowFileRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const refs: IFlowFileRef[] = [];
  for (const r of raw) {
    if (typeof r === "string") {
      if (isSafePath(r)) refs.push({ path: r });
    } else if (isRecord(r)) {
      const path = str(r.path);
      if (path && isSafePath(path)) {
        const line = typeof r.line === "number" ? r.line : undefined;
        refs.push({ path, line });
      }
    }
  }
  return refs.length ? refs : undefined;
}

/** Repo-relative path or http(s) URL only. Blocks javascript:/data:/vbscript: etc. */
function isSafePath(p: string): boolean {
  const t = p.trim();
  if (/^(javascript|data|vbscript|file):/i.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(t); // no scheme at all → treat as a repo path
}
