const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
  nbsp: " ",
};

/**
 * Rich-text (HTML) → a flat plain-text excerpt for scannable list rows.
 *
 * ponytail: a regex tag-strip, NOT a security sanitizer. The output is rendered
 * as text (React escapes it), so an unclosed/hostile tag can only degrade the
 * excerpt, never inject. Real sanitize-then-render-HTML lives in
 * `sanitize-html.ts`; use that when you actually need the markup back.
 */
export function stripHtmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (_, e: string) => ENTITIES[e] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}
