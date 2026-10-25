/** Totals row of `GET .../code/metrics/`. */
export interface ICodeMetricsTotals {
  files: number;
  loc: number;
}

/** Lines of code for one detected language. */
export interface ILanguageLoc {
  name: string;
  loc: number;
}

/** One CCN (cyclomatic complexity) histogram bucket, e.g. `{ range: "11-20", count: 4 }`. */
export interface IComplexityBucket {
  range: string;
  count: number;
}

/** One of the most complex functions found (lizard's "worst offenders"). */
export interface IWorstComplexityFn {
  name: string;
  file: string;
  ccn: number;
}

export interface IComplexitySummary {
  buckets: IComplexityBucket[];
  worst: IWorstComplexityFn[];
}

/** `percent` is `null` when duplication was **not measured** (jscpd unavailable,
 * timed out, or returned nothing) — deliberately distinct from a real `0`, which
 * means "measured, no duplication found". Render the two differently. */
export interface IDuplicationSummary {
  percent: number | null;
}

/** A file ranked by `hotspot = norm(complexity) * norm(churn)` (top 30, desc). */
export interface IHotspot {
  file: string;
  complexity: number;
  churn: number;
  hotspot: number;
}

/** A detected import cycle — the ordered list of modules/files in the cycle. */
export interface IDependencyCycle {
  modules: string[];
}

export interface IDependenciesSummary {
  cycles: IDependencyCycle[];
}

/** Semgrep's severity for a finding. Semgrep's own vocabulary — deliberately not
 * mapped onto SonarQube's Software-Quality × Severity grid, which we can't populate. */
export type TIssueSeverity = "ERROR" | "WARNING" | "INFO";

/** One static-analysis finding, located at `file:line` (repo-relative, so it joins
 * with hotspots/graph and the GIA-15 SDLC edges). */
export interface IIssue {
  rule: string;
  severity: TIssueSeverity;
  file: string;
  line: number;
  message: string;
  /** CWE identifiers from the rule's metadata, e.g. `["CWE-327: ..."]`. Often empty. */
  cwe: string[];
}

/** How often one rule fired, for the summary's "most frequent rules". */
export interface IIssueRuleCount {
  rule: string;
  severity: TIssueSeverity;
  count: number;
}

/** The **capped** issue summary carried on `metrics.json` — counts, the top rules,
 * and the most severe findings. Capped because that payload is handed to the LLM
 * whole; the full list lives behind `GET .../code/issues/`. */
export interface IIssuesSummary {
  counts: { error: number; warning: number; info: number };
  by_rule: IIssueRuleCount[];
  top: IIssue[];
}

/** Which scanner produced `languages` + `totals`. `"scc"` is the real measurement;
 * `"file_scan"` is the fallback used when scc is unavailable — it recognises only 11
 * extensions and counts raw lines rather than code lines, so its numbers are real but
 * materially narrower and must be labelled as such (GIN-135). `null` on an older
 * `metrics.json` written before the field existed — unknown, so claim nothing. */
export type TLanguagesSource = "scc" | "file_scan";

/** Shape of `GET .../code/metrics/` — mirrors the backend's `metrics.json` (Plan 4). */
export interface ICodeMetrics {
  totals: ICodeMetricsTotals;
  languages: ILanguageLoc[];
  languages_source: TLanguagesSource | null;
  complexity: IComplexitySummary;
  duplication: IDuplicationSummary;
  hotspots: IHotspot[];
  dependencies: IDependenciesSummary;
  /** `null` when the scan didn't run (scanner unavailable) — deliberately distinct
   * from all-zero counts, which mean "scanned, nothing found". */
  issues: IIssuesSummary | null;
}

/** Shape of `GET .../code/issues/` — the full finding list (GIN-130).
 *
 * `scanned` is the honest signal: `false` means semgrep never ran, which must not
 * render the same as a clean repo. `truncated` is set when the backend's 5,000 cap
 * bit — surface it rather than silently showing a partial list. */
export interface IIssuesPayload {
  issues: IIssue[];
  truncated: boolean;
  scanned: boolean;
}
