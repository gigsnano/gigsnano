/**
 * Data contracts for the Codebase Intelligence workspace.
 *
 * The live `code/graph` API is thin (`{ id, label, kind, community, source_file }`
 * + `{ source, target, weight }`), so the richer shapes below — coverage, risk,
 * relationship types, and all SDLC traceability — are currently served by the
 * isolated fixture in `src/mocks/data/codebase-intelligence.ts`. They map 1:1 to
 * the planned backend (GIA-15 SDLC graph edges, GIA-17 metrics, GIA-20 QC/deploys);
 * when those ship, swap the fixture for the API and these types stay put.
 */

import type { ISubtreeAggregate } from "@/lib/code/real-intelligence";

export type CodeNodeType =
  | "repository"
  | "module"
  | "folder"
  | "file"
  | "class"
  | "function"
  | "api"
  | "database"
  | "table"
  | "queue"
  | "test"
  | "external";

export type ERiskLevel = "low" | "medium" | "high";

export interface CodeNode {
  id: string;
  type: CodeNodeType;
  name: string;
  path?: string;
  module?: string;
  language?: string;
  owner?: string;
  risk?: ERiskLevel;
  coverage?: number; // 0–100
  complexity?: number;
  childCount?: number;
  metadata?: Record<string, unknown>;
}

export type CodeRelationType =
  | "contains"
  | "imports"
  | "calls"
  | "implements"
  | "extends"
  | "exposes_api"
  | "consumes_api"
  | "reads"
  | "writes"
  | "tests"
  | "changed_with";

export interface CodeRelation {
  id: string;
  source: string;
  target: string;
  type: CodeRelationType;
  label?: string;
  weight?: number;
}

/** The nine primary workspace views (kept in the `?view=` query string). */
export type CodebaseViewId =
  | "overview"
  | "modules"
  | "dependencies"
  | "call-flow"
  | "api-flow"
  | "data-flow"
  | "schema"
  | "metrics"
  | "issues";

/** Repository context shown in the header, straight from the project record.
 *
 * Every field except `repo` is nullable because every one of them can genuinely be
 * unknown: a project with no linked repo has no branch, and one that has never
 * finished an index has no commit or indexed-at. They used to fall back to fixture
 * values, so the header showed a plausible repo/commit/"Indexed 2d ago" for a repo
 * that wasn't yours (GIN-158). Null means "don't claim it". */
export interface ICodebaseRepoContext {
  repo: string;
  branch: string | null;
  commitSha: string | null;
  lastIndexedIso: string | null;
  githubSynced: boolean;
}

/** One clickable metric in the summary bar; `filter` applies a graph preset. */
export interface ICodebaseMetric {
  key: string;
  label: string;
  value: number | string;
  /** node-type or relationship filter this metric focuses when clicked */
  filter?: { nodeType?: CodeNodeType; relation?: CodeRelationType; preset?: "cycles" | "hotspots" };
  tone?: "default" | "warn" | "danger";
}

/** Module legend / summary row. */
export interface IModuleSummary {
  key: string;
  name: string;
  nodeCount: number;
  coverage?: number;
  risk?: ERiskLevel;
  churn?: "low" | "medium" | "high";
  apis?: number;
  files?: number;
}

/** A node in the left Code Explorer tree. */
export interface ICodeTreeNode {
  id: string;
  name: string;
  type: CodeNodeType;
  path?: string;
  nodeCount?: number;
  coverage?: number;
  risk?: ERiskLevel;
  children?: ICodeTreeNode[];
}

export interface ITraceRequirement {
  code: string;
  title: string;
}
export interface ITraceStory {
  code: string;
  title: string;
  status?: string;
}
export interface ITracePr {
  number: number;
  title: string;
  merged?: boolean;
}
export interface ITraceQc {
  label: string;
  outcome: "pass" | "concerns" | "fail";
}
export interface ITraceDeployment {
  env: string;
  status: "success" | "failed" | "pending";
  when: string;
}
export interface ITraceChange {
  pr: number;
  title: string;
  when: string;
  author?: string;
}

/** Full inspector payload for a selected node. */
export interface INodeInspectorDetail {
  id: string;
  name: string;
  type: CodeNodeType;
  path?: string;
  status?: string;
  owner?: string;
  purpose?: string;
  inbound: number;
  outbound: number;
  coverage?: number;
  complexity?: "low" | "medium" | "high";
  apis: string[];
  tests: number;
  dependencies: { id: string; name: string; type: CodeNodeType }[];
  dependents: { id: string; name: string; type: CodeNodeType }[];
  relatedTables: string[];
  recentChanges: ITraceChange[];
  /** Real subtree rollup for folder/repository/module selections (Task 8);
   * absent for symbol/file selections, which use the inbound/outbound/tests
   * fields above instead. */
  aggregate?: ISubtreeAggregate;
  traceability: {
    requirements: ITraceRequirement[];
    stories: ITraceStory[];
    sprints: string[];
    prs: ITracePr[];
    qc: ITraceQc[];
    deployments: ITraceDeployment[];
  };
}

/** Everything the Codebase workspace renders — all of it derived from the real index.
 *
 * There is no fixture behind this any more (GIN-154). `tree`, `modules` and `metrics`
 * are computed from the code graph, so they are null until it loads: callers render a
 * loading or empty state rather than stand-in numbers.
 *
 * The old `nodes`/`relations`/`details` fields are gone. They were a hand-written cast
 * of api/service/table nodes that every project displayed as its own architecture; the
 * flow views now derive from the real graph or say they can't (GIN-156), and inspector
 * detail is built from the graph on demand. */
export interface ICodebaseIntelligence {
  repo: ICodebaseRepoContext | null;
  metrics: ICodebaseMetric[] | null;
  modules: IModuleSummary[] | null;
  tree: ICodeTreeNode | null;
}
