import DOMPurify from "dompurify";

/**
 * Sanitize HTML the app did **not** just generate itself — legacy stored columns
 * and activity snapshots (GIN-354). Every normal description/comment render goes
 * through a read-only TipTap instance, which drops out-of-schema tags for free;
 * raw `dangerouslySetInnerHTML` sinks fed by stored content have no such filter,
 * so they must sanitize here.
 *
 * DOMPurify's default config strips scripts, event handlers (`onerror`, …) and
 * other active content while keeping ordinary rich-text formatting.
 */
export function sanitizeHtml(html: string): string {
  // ponytail: DOMPurify needs a DOM. The only sinks that call this render
  // client-side after user interaction (never in the initial SSR pass), so a
  // server-side "" is never user-visible and avoids a no-window crash.
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html);
}
