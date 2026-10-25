/**
 * Derive the Codebase Intelligence surfaces that the REAL `code/graph` + metrics
 * API can support (counts, the file tree, module summaries) — replacing the
 * fixture wherever real data exists. Coverage/risk/owner/PR/QC stay fixture-or-
 * empty until the backend provides them (GIA-17/20).
 */
import type { ICodeGraph } from "@/types";
import { EIndexStatus } from "@/types";
import type { ICodeMetrics } from "@/types/code/metrics";
import type {
  ERiskLevel,
  ICodebaseMetric,
  ICodeTreeNode,
  IModuleSummary,
} from "@/types/code/intelligence";

import { relPath } from "./module-tree";

const isTestPath = (p: string) => /(^|\/)tests?\/|_test\.|\.test\.|\.spec\.|(^|\/)test_/.test(p.toLowerCase());

const RISK_RANK: Record<ERiskLevel, number> = { low: 0, medium: 1, high: 2 };
const maxRisk = (a: ERiskLevel | undefined, b: ERiskLevel | undefined): ERiskLevel | undefined =>
  a === undefined ? b : b === undefined ? a : RISK_RANK[a] >= RISK_RANK[b] ? a : b;

/** Real per-file risk from the metrics hotspot list (`hotspot = norm(complexity)
 * × norm(churn)`, 0–1). Flagged files bucket to a risk level; unflagged files
 * carry no risk (kept out of the map to stay low-noise).
 * ponytail: absolute thresholds — swap for percentile-of-max if the split reads off. */
export function fileRiskFromMetrics(metrics: ICodeMetrics | null): Map<string, ERiskLevel> {
  const risk = new Map<string, ERiskLevel>();
  if (!metrics) return risk;
  for (const h of metrics.hotspots) {
    risk.set(relPath(h.file), h.hotspot >= 0.5 ? "high" : h.hotspot >= 0.2 ? "medium" : "low");
  }
  return risk;
}

/** Real per-file complexity from lizard's worst-offender CCN (max over the
 * file's functions). Standard CCN bands: ≤10 low, 11–20 medium, ≥21 high.
 * Undefined when the file has no measured hot function. */
export function fileComplexityFromMetrics(
  metrics: ICodeMetrics | null,
  path: string,
): "low" | "medium" | "high" | undefined {
  if (!metrics) return undefined;
  const rel = relPath(path);
  let ccn = 0;
  for (const w of metrics.complexity.worst) if (relPath(w.file) === rel) ccn = Math.max(ccn, w.ccn);
  if (ccn === 0) return undefined;
  return ccn >= 21 ? "high" : ccn >= 11 ? "medium" : "low";
}

function segmentsOf(graph: ICodeGraph) {
  return graph.nodes.map((n) => ({ n, p: relPath(n.source_file ?? n.id) }));
}

/** Module = the dir *under* `src` (paths are `src/<module>/…`), else the top
 * segment. `key` is a tree path (so the legend can focus it); `name` is short. */
function moduleKeyName(segs: string[]): { key: string; name: string } {
  if (segs[0] === "src" && segs.length >= 3) return { key: `src/${segs[1]}`, name: segs[1] };
  if (segs.length >= 2) return { key: segs[0], name: segs[0] };
  return { key: "(root)", name: "(root)" };
}

/** Metric bar from the real graph + metrics.json. APIs are omitted (the graph
 * carries no typed API nodes yet). */
export function computeRealMetrics(graph: ICodeGraph, metrics: ICodeMetrics | null): ICodebaseMetric[] {
  let classes = 0;
  let functions = 0;
  let tests = 0;
  const modules = new Set<string>();
  for (const { n, p } of segmentsOf(graph)) {
    const segs = p.split("/").filter(Boolean);
    if (segs.length >= 2) modules.add(moduleKeyName(segs).key);
    const kind = (n.kind ?? "").toLowerCase();
    if (kind === "class" || kind === "interface") classes++;
    else if (kind === "function" || kind === "method") functions++;
    else if (kind === "file" && isTestPath(p)) tests++;
  }
  const files = metrics?.totals.files ?? segmentsOf(graph).filter(({ n }) => (n.kind ?? "") === "file").length;
  return [
    { key: "modules", label: "Modules", value: modules.size },
    { key: "files", label: "Files", value: files },
    { key: "classes", label: "Classes", value: classes, filter: { nodeType: "class" } },
    { key: "functions", label: "Functions", value: functions, filter: { nodeType: "function" } },
    { key: "tests", label: "Tests", value: tests, filter: { nodeType: "test" } },
    {
      key: "cycles",
      label: "Circular deps",
      value: metrics?.dependencies.cycles.length ?? 0,
      tone: "warn",
      filter: { preset: "cycles" },
    },
    {
      key: "hotspots",
      label: "High-risk hotspots",
      value: metrics?.hotspots.length ?? 0,
      tone: "danger",
      filter: { preset: "hotspots" },
    },
  ];
}

/** Real repository file tree from the graph's symbol file-paths. When metrics
 * are supplied, each hotspot file gets a real `risk` that rolls up to ancestors. */
export function buildRealTree(
  graph: ICodeGraph,
  repoName: string,
  metrics: ICodeMetrics | null = null,
): ICodeTreeNode {
  const risk = fileRiskFromMetrics(metrics);
  const fileSymbols = new Map<string, number>();
  for (const { p } of segmentsOf(graph)) {
    if (p) fileSymbols.set(p, (fileSymbols.get(p) ?? 0) + 1);
  }
  const root: ICodeTreeNode = { id: "repo", name: repoName, type: "repository", nodeCount: 0, children: [] };
  const byKey = new Map<string, ICodeTreeNode>();
  byKey.set("", root);

  for (const [path, count] of fileSymbols) {
    const fileRisk = risk.get(path);
    const segs = path.split("/").filter(Boolean);
    let parent = root;
    for (let i = 0; i < segs.length; i++) {
      const isFile = i === segs.length - 1;
      const key = segs.slice(0, i + 1).join("/");
      let node = byKey.get(key);
      if (!node) {
        node = {
          id: key,
          name: segs[i],
          type: isFile ? "file" : "folder",
          path: key,
          nodeCount: 0,
          children: isFile ? undefined : [],
        };
        byKey.set(key, node);
        (parent.children ??= []).push(node);
      }
      node.nodeCount = (node.nodeCount ?? 0) + count;
      node.risk = maxRisk(node.risk, fileRisk); // roll risk up to every ancestor
      parent = node;
    }
    root.nodeCount = (root.nodeCount ?? 0) + count;
  }

  sortTree(root);
  return root;
}

function sortTree(node: ICodeTreeNode) {
  if (!node.children) return;
  node.children.sort((a, b) => {
    const af = a.type === "folder" ? 0 : 1;
    const bf = b.type === "folder" ? 0 : 1;
    return af - bf || a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

/** Real module legend: top-level directories with their symbol counts. When
 * metrics are supplied, each module's `risk` is the max risk of its files. */
export function computeRealModules(
  graph: ICodeGraph,
  metrics: ICodeMetrics | null = null,
): IModuleSummary[] {
  const fileRisk = fileRiskFromMetrics(metrics);
  const counts = new Map<string, { name: string; count: number; risk?: ERiskLevel }>();
  for (const { p } of segmentsOf(graph)) {
    const segs = p.split("/").filter(Boolean);
    const { key, name } = moduleKeyName(segs);
    const e = counts.get(key) ?? { name, count: 0 };
    e.count++;
    e.risk = maxRisk(e.risk, fileRisk.get(p));
    counts.set(key, e);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, v]) => ({ key, name: v.name, nodeCount: v.count, risk: v.risk }));
}

export interface ISubtreeAggregate {
  nodeCount: number;
  files: number;
  classes: number;
  functions: number;
  tests: number;
  submodules: number;
  risk?: ERiskLevel;
  languages: string[];
  hotspots: string[];
}

export function aggregateSubtree(
  graph: ICodeGraph,
  prefix: string,
  metrics: ICodeMetrics | null,
): ISubtreeAggregate {
  const risk = fileRiskFromMetrics(metrics);
  const under = (p: string) => prefix === "" || p === prefix || p.startsWith(prefix + "/");
  const files = new Set<string>();
  const subs = new Set<string>();
  let classes = 0;
  let functions = 0;
  let tests = 0;
  let nodeCount = 0;
  let agg: ERiskLevel | undefined;

  for (const { n, p } of segmentsOf(graph)) {
    if (!under(p)) continue;
    nodeCount++;
    files.add(p);
    const rest = (prefix === "" ? p : p.slice(prefix.length + 1)).split("/").filter(Boolean);
    if (rest.length > 1) subs.add(rest[0]);
    const kind = (n.kind ?? "").toLowerCase();
    if (kind === "class" || kind === "interface") classes++;
    else if (kind === "function" || kind === "method") functions++;
    if (isTestPath(p)) tests++;
    agg = maxRisk(agg, risk.get(p));
  }

  const hotspots = (metrics?.hotspots ?? [])
    .map((h) => relPath(h.file))
    .filter(under)
    .slice(0, 5);
  const languages = [...new Set((metrics?.languages ?? []).map((l) => l.name))];

  return {
    nodeCount,
    files: files.size,
    classes,
    functions,
    tests,
    submodules: subs.size,
    risk: agg,
    languages,
    hotspots,
  };
}

export interface IIndexQuality {
  level: "healthy" | "partial" | "degraded" | "none";
  symbols: number;
  relationships: number;
  files: number;
}

const SYMBOL_KINDS = new Set(["class", "function", "method", "interface"]);

export function indexQuality(graph: ICodeGraph | null, status: EIndexStatus): IIndexQuality {
  if (!graph || status !== EIndexStatus.Ready || graph.nodes.length === 0) {
    return { level: "none", symbols: 0, relationships: 0, files: 0 };
  }

  let symbols = 0;
  let files = 0;
  let degraded = false;

  for (const n of graph.nodes) {
    const k = (n.kind ?? "").toLowerCase();
    if (SYMBOL_KINDS.has(k)) symbols++;
    if (k === "file") files++;
    if ((n as { degraded?: boolean }).degraded) degraded = true;
  }

  const level = symbols === 0 ? "partial" : degraded ? "degraded" : "healthy";
  return { level, symbols, relationships: graph.edges.length, files };
}
