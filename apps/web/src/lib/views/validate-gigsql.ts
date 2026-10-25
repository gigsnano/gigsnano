/**
 * Saved-view GigsQL validation (GIN-311).
 *
 * Saved views speak full GigsQL — the same grammar the Work Items toolbar, the
 * create-dialog prefill (`filtersToGigsql`), and the backend both save-validation
 * (`normalize_gigsql`) and execution (`parse_gigsql`) use. That grammar supports
 * multi-value `in (...)` and repeated `field:value` terms (OR within a field).
 *
 * The view dialogs previously validated with the legacy colon-only
 * `filter-query.ts`, which rejected `status in (todo, in_progress)` even though
 * every other layer accepts it. These helpers put the dialogs on the same
 * grammar as everything else so the four surfaces stop disagreeing.
 */

import { normalizeGigsql, parseGigsql, rejectCodeAnalysisDomain } from "./gigsql";

/**
 * An actionable validation error for a saved-view query, or null when it's
 * valid. Empty is valid (means "show everything"). Mirrors the backend, which
 * validates via `normalize_gigsql` and executes work-item queries only.
 */
export function gigsqlViewError(query: string | undefined | null): string | null {
  const norm = normalizeGigsql((query ?? "").trim());
  if (norm.kind === "empty") return null;
  if (norm.kind === "error") return norm.reason;

  // Syntactically valid, but code-analysis fields (severity/rule/file/author)
  // can't scope a work-item view — reject them like the toolbar does.
  const parsed = parseGigsql(norm.query);
  if (parsed.kind === "ok") {
    try {
      rejectCodeAnalysisDomain(parsed.node);
    } catch (e) {
      return e instanceof Error ? e.message : "Unsupported filter field.";
    }
  }
  return null;
}

/** True when the query is safe to save (empty is fine — it means "no filter"). */
export function isValidGigsqlView(query: string | undefined | null): boolean {
  return gigsqlViewError(query) === null;
}

/**
 * Canonical, stable representation to persist — `status:todo status:in_progress`
 * and `status in (todo, in_progress)` both store as the same normalized string,
 * so a reopened view round-trips identically.
 */
export function canonicalGigsqlView(query: string | undefined | null): string {
  const trimmed = (query ?? "").trim();
  const norm = normalizeGigsql(trimmed);
  return norm.kind === "ok" ? norm.query : trimmed;
}
