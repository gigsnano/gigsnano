import { sanitizeAuthRedirect } from "./sanitize-auth-redirect";

/**
 * Resolve where to send the user after sign-in.
 *
 * Handles the hosted-MCP OAuth hop: the authorize endpoint bounces an
 * unauthenticated user to `/sign-in?next=<same-origin absolute /oauth/authorize URL>`.
 * That target is a reverse-proxied backend route (see `next.config.ts` rewrites),
 * not a Next page — so the client router can't reach it and it needs a full-page
 * navigation. Cross-origin `next` values are still rejected (open-redirect guard).
 */
export function resolveAuthRedirect(
  next: string | null | undefined,
  fallback: string,
  origin: string,
): { url: string; hardNavigate: boolean } {
  let candidate: string | null = next?.trim() || null;
  if (candidate && /^https?:\/\//i.test(candidate)) {
    // Accept only same-origin absolute URLs; reduce to a path so sanitize can vet it.
    try {
      const parsed = new URL(candidate);
      candidate = parsed.origin === origin ? `${parsed.pathname}${parsed.search}` : null;
    } catch {
      candidate = null;
    }
  }
  const url = sanitizeAuthRedirect(candidate, fallback);
  const hardNavigate = url.startsWith("/oauth/") || url === "/mcp" || url.startsWith("/mcp/");
  return { url, hardNavigate };
}
