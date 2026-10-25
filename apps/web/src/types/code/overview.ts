/**
 * Codebase Overview contract (GIN-272) — mirrors the backend `CodebaseOverviewOut`
 * from `GET .../code/overview/`. Every section carries a `state` + `source` so the
 * dashboard renders honest availability (no fabricated metrics): a missing analyzer
 * degrades its own section, never the page.
 */

/** available = fresh & trustworthy · stale = older index than HEAD · partial = some
 * analyzers ran · indexing = build in flight · unavailable = nothing to show. */
export type SectionState = "available" | "stale" | "partial" | "indexing" | "unavailable";

/** Top-level index state, drives the dashboard's outer switch. */
export type OverviewState = "ready" | "stale" | "indexing" | "failed" | "empty" | "none";

export type HealthStatus = "healthy" | "warning" | "critical" | "unavailable";

export interface IProvenance {
  state: SectionState;
  source: string;
  built_at: string | null;
  detail: string | null;
}

export interface IOverviewIndex {
  status: string; // none | pending | indexing | ready | failed
  repo_full_name: string | null;
  branch: string | null;
  indexed_commit_sha: string | null;
  indexed_at: string | null;
  head_commit_sha: string | null;
  drifted: boolean;
  error: string | null;
}

export interface ICountsSection extends IProvenance {
  files: number;
  loc: number | null;
  symbols: number;
  edges: number;
  languages: number;
  languages_source: string | null;
}

export interface IHealthDimension {
  key: "architecture" | "maintainability" | "test_coverage" | "security";
  label: string;
  status: HealthStatus;
  score: number | null;
  evidence: string;
  drilldown: string | null;
}

export interface IHealthSection extends IProvenance {
  score: number | null;
  measured_dimensions: number;
  dimensions: IHealthDimension[];
}

export interface IOverviewModule {
  key: string;
  name: string;
  files: number;
  symbols: number;
}

export interface IModulesSection extends IProvenance {
  items: IOverviewModule[];
}

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface IRiskItem {
  id: string;
  severity: RiskSeverity;
  category: string; // security | hotspot
  title: string;
  evidence: string;
  location: string | null;
  analyzer: string;
  detected_at: string | null;
}

export interface IRisksSection extends IProvenance {
  items: IRiskItem[];
}

export interface IChangeItem {
  sha: string;
  short_sha: string;
  author: string;
  message: string;
  committed_at: string | null;
  is_indexed_head: boolean;
}

export interface IChangesSection extends IProvenance {
  items: IChangeItem[];
}

export interface ICodebaseOverview {
  state: OverviewState;
  index: IOverviewIndex;
  counts: ICountsSection;
  health: IHealthSection;
  modules: IModulesSection;
  risks: IRisksSection;
  changes: IChangesSection;
}
