/**
 * Convert rich HTML (e.g. a TipTap story/cycle description) into clean, readable
 * plain text that PRESERVES structure — block elements become line breaks and
 * list items become bullets — instead of collapsing everything into one run-on
 * line the way a naive tag-strip does.
 *
 * Used to prefill the marketplace publish dialog and, downstream, the listing
 * description shown to freelancers (rendered with `whitespace-pre-wrap`), so the
 * work item's Summary / Acceptance-Criteria sections stay legible end to end.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";

  let text = html;

  // List items → bullets (before their tags are stripped). The opening tag adds
  // the line break, so `</li>` is intentionally NOT a block closer below (else
  // adjacent items would be separated by a blank line).
  text = text.replace(/<li[^>]*>/gi, "\n• ");

  // Block-level closers and <br> → line breaks so sections don't run together.
  text = text.replace(/<\/(p|div|h[1-6]|ul|ol|blockquote|tr|section)>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Drop every remaining tag.
  text = text.replace(/<[^>]+>/g, "");

  // Decode the handful of entities TipTap emits.
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");

  // Tidy up: collapse intra-line whitespace, trim each line, cap blank runs.
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
