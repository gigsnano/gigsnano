/**
 * GIN-281 — rollout flag + safe fallback for the redesigned Codebase Overview.
 * When `NEXT_PUBLIC_CODEBASE_OVERVIEW_V2` is explicitly "false", the Overview tab
 * renders the legacy graph workspace instead of the dashboard — so the redesign can
 * be dark-launched or rolled back via config, without shipping a code revert. On by
 * default (any value except "false"), so the new experience is the norm.
 */
export function isOverviewDashboardEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CODEBASE_OVERVIEW_V2 !== "false";
}
