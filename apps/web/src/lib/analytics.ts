/**
 * Minimal client-analytics seam (GIN-281). A single `track()` that forwards to a
 * host-provided sink (`window.gnAnalytics(event, props)`) when one is installed,
 * and no-ops otherwise — so a real provider (PostHog/Segment/first-party) can drop
 * in behind this function without touching call sites. Deliberately tiny: this is a
 * seam, not an analytics framework (YAGNI).
 *
 * Never pass source code, secrets, or PII in `props` — only ids, enums, and counts.
 */
type AnalyticsSink = (event: string, props?: Record<string, unknown>) => void;

export function track(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const sink = (window as unknown as { gnAnalytics?: AnalyticsSink }).gnAnalytics;
  try {
    sink?.(event, props);
  } catch {
    // Analytics must never break a user flow.
  }
}

/** Codebase Overview events (GIN-281): load, error, drill-down, quick path, Ask. */
export const codebaseAnalytics = {
  overviewLoaded: (projectId: string, state: string) =>
    track("codebase_overview_loaded", { project_id: projectId, state }),
  overviewError: (projectId: string) =>
    track("codebase_overview_error", { project_id: projectId }),
  drilldown: (projectId: string, target: string) =>
    track("codebase_drilldown", { project_id: projectId, target }),
  quickPath: (projectId: string, path: string) =>
    track("codebase_quick_path", { project_id: projectId, path }),
  askOpened: (projectId: string) =>
    track("codebase_ask_opened", { project_id: projectId }),
};
