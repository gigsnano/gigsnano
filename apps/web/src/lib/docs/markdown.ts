function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text: string): string {
  // Escape first, then layer inline formatting onto the escaped text. Code is
  // applied before bold so `**` inside a code span isn't turned into <strong>.
  return escapeHtml(text)
    .replace(
      /`([^`]+?)`/g,
      '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">$1</code>',
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(header: string[], rows: string[][]): string {
  const th = header
    .map(
      (c) =>
        `<th class="border border-border px-3 py-1.5 text-left font-semibold">${inlineMarkdown(c)}</th>`,
    )
    .join("");
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (c) =>
              `<td class="border border-border px-3 py-1.5 align-top">${inlineMarkdown(c)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="my-2 overflow-x-auto"><table class="w-full border-collapse text-sm"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const HR_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const TABLE_SEP_RE = /^\|?[\s:]*-{2,}[\s:|-]*\|?$/;
const FENCE_RE = /^```(\w*)\s*$/;

/** A document block: either prose (rendered as markdown) or a fenced code block
 *  (rendered as a diagram when the language is `mermaid`, else as a code block). */
export type DocBlock =
  | { kind: "markdown"; text: string }
  | { kind: "code"; lang: string; code: string };

/**
 * Split document content into ordered blocks for the reviewer view.
 *
 * Fence-aware: a ```lang … ``` block stays a single block even when it contains
 * blank lines (so a mermaid/GraphViz diagram isn't shredded by the blank-line
 * split), and carries its language so the renderer can pick a diagram vs. code
 * presentation. Prose regions between fences split on blank lines exactly like
 * the previous splitter, keeping comment `block_index` stable for fence-free docs.
 */
export function splitDocBlocks(content: string): DocBlock[] {
  const lines = content.split("\n");
  const blocks: DocBlock[] = [];
  let prose: string[] = [];

  const flushProse = () => {
    if (prose.length === 0) return;
    for (const part of prose.join("\n").split(/\n\n+/)) {
      if (part.trim()) blocks.push({ kind: "markdown", text: part });
    }
    prose = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(FENCE_RE);
    if (open) {
      flushProse();
      const lang = open[1] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      // `i` now sits on the closing fence (consumed by the loop's i++) or past EOF.
      blocks.push({ kind: "code", lang, code: body.join("\n") });
      continue;
    }
    prose.push(lines[i]);
  }

  flushProse();
  return blocks;
}

/** Minimal markdown → HTML for document blocks (headers, bold, inline code,
 *  lists, horizontal rules, and pipe tables). */
export function renderSimpleMarkdown(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    // Horizontal rule.
    if (HR_RE.test(trimmed)) {
      closeList();
      html.push('<hr class="my-3 border-border" />');
      continue;
    }

    // Pipe table: a `| … |` row immediately followed by a `|---|` separator.
    if (
      trimmed.startsWith("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("-") &&
      TABLE_SEP_RE.test(lines[i + 1].trim())
    ) {
      closeList();
      const header = splitRow(trimmed);
      i += 1; // consume the separator row
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
        i += 1;
        rows.push(splitRow(lines[i].trim()));
      }
      html.push(renderTable(header, rows));
      continue;
    }

    const h3 = trimmed.match(/^### (.+)$/);
    if (h3) {
      closeList();
      html.push(`<h3 class="text-sm font-semibold mt-2 mb-1">${inlineMarkdown(h3[1])}</h3>`);
      continue;
    }

    const h2 = trimmed.match(/^## (.+)$/);
    if (h2) {
      closeList();
      html.push(`<h2 class="text-base font-semibold mt-3 mb-1">${inlineMarkdown(h2[1])}</h2>`);
      continue;
    }

    const h1 = trimmed.match(/^# (.+)$/);
    if (h1) {
      closeList();
      html.push(`<h1 class="text-lg font-semibold mt-3 mb-1">${inlineMarkdown(h1[1])}</h1>`);
      continue;
    }

    const li = trimmed.match(/^[-*] (.+)$/);
    if (li) {
      if (!inList) {
        html.push('<ul class="list-disc space-y-0.5 pl-5">');
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(li[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p class="mb-1">${inlineMarkdown(trimmed)}</p>`);
  }

  closeList();
  return html.join("");
}
