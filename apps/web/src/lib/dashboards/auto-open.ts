/** `?browse=1` — the user asked for the list rather than the dashboard. */
export const BROWSE_PARAM = "browse";

/**
 * The dashboard to open instead of showing the directory, or null to show it.
 *
 * With exactly one dashboard, the directory is a card grid whose only purpose
 * is one click. Opening it directly removes a step that has no decision in it.
 *
 * The `browsing` escape is what keeps it from becoming a trap: without it, the
 * single dashboard swallows every route back to the list, and "New dashboard"
 * — the one control that would give you a second one — is unreachable.
 */
export function autoOpenDashboardId(
  dashboards: { id: string }[] | undefined,
  browsing: boolean,
): string | null {
  if (browsing || !dashboards || dashboards.length !== 1) return null;
  return dashboards[0].id;
}
