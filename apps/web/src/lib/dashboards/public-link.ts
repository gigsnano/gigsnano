/** The public URL a dashboard share token resolves to (GIN-489), on whatever
 *  host the app is served from — so a link copied from a preview deployment
 *  points at that deployment, not production. */
export function publicDashboardUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/public/d/${token}`;
}
