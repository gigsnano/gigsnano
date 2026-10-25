import { createHighlighter, type BundledLanguage } from "shiki";

import { contentLines, shikiLanguageFromPath } from "./file-preview";

const WORKSPACE_LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "python",
  "go",
  "rust",
  "java",
  "kotlin",
  "csharp",
  "cpp",
  "c",
  "ruby",
  "php",
  "swift",
  "sql",
  "shellscript",
  "yaml",
  "toml",
  "json",
  "xml",
  "html",
  "css",
  "scss",
  "less",
  "vue",
  "svelte",
  "dockerfile",
  "graphql",
  "markdown",
  "dotenv",
] as const satisfies BundledLanguage[];

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: [...WORKSPACE_LANGS],
    });
  }
  return highlighterPromise;
}

/** Highlight workspace file content as themed HTML (github-light / github-dark). */
export async function highlightWorkspaceCode(
  content: string,
  path: string,
): Promise<string | null> {
  const lang = shikiLanguageFromPath(path);
  if (!lang) return null;

  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(content, {
    lang,
    themes: {
      light: "github-light",
      dark: "github-dark",
    },
    defaultColor: "light-dark()",
  });
}

/** Pure 1-based inclusive line-range slice, capped at `max` lines. */
export function sliceRange(
  content: string,
  start: number,
  end: number,
  max = 200,
): { text: string; truncated: boolean } {
  const lines = contentLines(content);
  const from = Math.max(0, start - 1);
  const to = Math.min(lines.length, Math.max(from, end));
  const slice = lines.slice(from, to);
  const truncated = slice.length > max;
  return { text: (truncated ? slice.slice(0, max) : slice).join("\n"), truncated };
}

/**
 * Strip shiki's outer `<pre …><code …>` / `</code></pre>` wrapper, keeping
 * the inner `<span class="line">…</span>` sequence intact. `<pre>`/`<code>`
 * are block elements, invalid inside the markdown `<p>` a citation snippet
 * renders in; callers supply their own `<span>` block wrapper instead.
 * Returns the html unchanged if the expected wrapper shape isn't found.
 */
export function stripPreCodeWrapper(html: string): string {
  const stripped = html
    .replace(/^\s*<pre[^>]*>\s*<code[^>]*>/, "")
    .replace(/<\/code>\s*<\/pre>\s*$/, "");
  return stripped || html;
}

/** Highlight a 1-based inclusive line range of a workspace file (citation code peek). */
export async function highlightWorkspaceCodeRange(
  content: string,
  path: string,
  start: number,
  end: number,
  max = 200,
): Promise<{ html: string | null; startLine: number; truncated: boolean }> {
  const { text, truncated } = sliceRange(content, start, end, max);
  const html = await highlightWorkspaceCode(text, path);
  return { html: html ? stripPreCodeWrapper(html) : html, startLine: Math.max(1, start), truncated };
}
