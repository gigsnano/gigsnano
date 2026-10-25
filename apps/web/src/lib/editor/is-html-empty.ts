/** True when TipTap HTML is empty (e.g. `<p></p>` or whitespace-only). */
export function isEditorHtmlEmpty(html: string): boolean {
  if (/<mention-component[\s>]/i.test(html)) return false;
  const stripped = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !stripped;
}
