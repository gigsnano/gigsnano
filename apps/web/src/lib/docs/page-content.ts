import { renderSimpleMarkdown } from "./markdown";

/** True when the string looks like HTML markup (TipTap-authored pages).
 * Legacy page bodies are markdown and must keep the SimpleMarkdown path. */
export function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * A page body as HTML, for seeding the TipTap editor.
 *
 * The editor only speaks HTML: handing it a legacy markdown body turns every
 * `##` and `-` into literal text, and saving then persists that damage. Convert
 * once, here, so both the Edit and post-conflict Reload paths get it right.
 */
export function pageContentHtml(content: string): string {
  return looksLikeHtml(content) ? content : renderSimpleMarkdown(content);
}
