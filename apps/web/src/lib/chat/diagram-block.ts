import { EDiagramKind, type IDiagramBlock, type IDiagramEdge, type IDiagramNode } from "@/types";

// Matches ```gigs:diagram\n{...}\n``` blocks (non-greedy, across lines).
const BLOCK_RE = /```gigs:diagram\n([\s\S]*?)\n```/g;
const VALID_KINDS = new Set<string>(Object.values(EDiagramKind));

function coerceKind(value: unknown): EDiagramKind {
  return typeof value === "string" && VALID_KINDS.has(value)
    ? (value as EDiagramKind)
    : EDiagramKind.Flow;
}

function parseNode(raw: unknown): IDiagramNode[] {
  if (typeof raw !== "object" || raw === null) return [];
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const label = typeof o.label === "string" ? o.label : "";
  if (!id || !label) return [];
  const node: IDiagramNode = { id, label, kind: typeof o.kind === "string" ? o.kind : "node" };
  if (typeof o.summary === "string") node.summary = o.summary;
  if (typeof o.detail === "string") node.detail = o.detail;
  if (typeof o.file === "string") node.file = o.file;
  if (typeof o.line === "number") node.line = o.line;
  if (typeof o.expandable === "boolean") node.expandable = o.expandable;
  return [node];
}

function parseEdge(raw: unknown, ids: Set<string>): IDiagramEdge[] {
  if (typeof raw !== "object" || raw === null) return [];
  const o = raw as Record<string, unknown>;
  if (typeof o.source !== "string" || typeof o.target !== "string") return [];
  if (!ids.has(o.source) || !ids.has(o.target)) return [];
  const edge: IDiagramEdge = { source: o.source, target: o.target };
  if (typeof o.label === "string") edge.label = o.label;
  if (typeof o.kind === "string") edge.kind = o.kind;
  return [edge];
}

/** Extract `gigs:diagram` fenced JSON blocks. Invalid blocks (bad JSON, no valid nodes) are skipped. */
export function parseDiagramBlocks(text: string): IDiagramBlock[] {
  const blocks: IDiagramBlock[] = [];
  let index = 0;
  for (const match of text.matchAll(BLOCK_RE)) {
    const i = index;
    index += 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const o = parsed as Record<string, unknown>;
    const nodes = Array.isArray(o.nodes) ? o.nodes.flatMap(parseNode) : [];
    if (nodes.length === 0) continue;
    const ids = new Set(nodes.map((n) => n.id));
    const edges = Array.isArray(o.edges) ? o.edges.flatMap((e) => parseEdge(e, ids)) : [];
    const block: IDiagramBlock = {
      id: typeof o.id === "string" && o.id ? o.id : `diagram-${i}`,
      kind: coerceKind(o.kind),
      nodes,
      edges,
    };
    if (typeof o.title === "string") block.title = o.title;
    if (typeof o.based_on_sha === "string") block.based_on_sha = o.based_on_sha;
    blocks.push(block);
  }
  return blocks;
}

/** Text with `gigs:diagram` blocks removed, for clean display. */
export function stripDiagramBlocks(text: string): string {
  return text.replace(BLOCK_RE, "").trim();
}
