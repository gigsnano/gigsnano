/** One run of text with the inline styles it inherits. */
export interface IRichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  /** Only http(s) and mailto links survive. */
  href?: string;
}

export type TRichBlockKind = "p" | "heading" | "li" | "quote" | "pre";

/** A paragraph-level block. List items carry their marker and nesting depth. */
export interface IRichBlock {
  kind: TRichBlockKind;
  spans: IRichSpan[];
  /** Heading level 1-6. */
  level?: number;
  /** List nesting, 1 for a top-level item. */
  depth?: number;
  /** "•" for bullets, "3." for ordered items. */
  marker?: string;
}

type TInline = Omit<IRichSpan, "text">;

const NAMED: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&", nbsp: " " };
const INLINE_TAGS: Record<string, keyof TInline> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  u: "underline",
  s: "strike",
  del: "strike",
  strike: "strike",
  code: "code",
};
const SAFE_HREF = /^(https?:|mailto:)/i;

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[body.toLowerCase()] ?? m;
  });
}

/**
 * Some stored descriptions arrive entity-escaped (`&lt;p&gt;`), sometimes inside a plain `<p>`
 * wrapper. When the only real tags are such wrappers, unwrap the escaping once so the inner tags parse.
 */
function unescapeIfEscaped(input: string): string {
  const hasEscapedTags = /&lt;\/?[a-z][^&]*&gt;/i.test(input);
  const realTags = input.match(/<\/?([a-z][a-z0-9]*)[^>]*>/gi) ?? [];
  const onlyWrappers = realTags.every((t) => /^<\/?(p|div|span|br)\b/i.test(t));
  return hasEscapedTags && onlyWrappers ? decodeEntities(input) : input;
}

function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : undefined;
}

/** Plain text without tags: blank lines split paragraphs, single newlines stay as breaks. */
function plainBlocks(text: string): IRichBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => ({ kind: "p" as const, spans: [{ text: decodeEntities(para) }] }));
}

/**
 * Parses the small HTML subset the backend emits (paragraphs, headings, lists, quotes, code,
 * bold/italic/underline/strike, links, line breaks) into blocks a native renderer can draw.
 * Unknown tags are ignored and their text kept; scripts and styles are dropped.
 */
export function parseRichText(input: string): IRichBlock[] {
  const html = unescapeIfEscaped(input ?? "");
  if (!/<\/?[a-z][^>]*>/i.test(html)) return plainBlocks(html);

  const blocks: IRichBlock[] = [];
  const inline: { tag: string; style: TInline }[] = [];
  const lists: { ordered: boolean; count: number }[] = [];
  let current: IRichBlock | null = null;
  let pre = 0;
  let skip = 0;

  const style = (): TInline => Object.assign({}, ...inline.map((i) => i.style));
  const close = () => {
    if (!current) return;
    const spans = current.spans;
    if (current.kind !== "pre") {
      // Trim the block's outer edges and drop spans the trim emptied.
      if (spans.length) spans[0].text = spans[0].text.replace(/^[ \t]+/, "");
      if (spans.length) spans[spans.length - 1].text = spans[spans.length - 1].text.replace(/[ \t\n]+$/, "");
    }
    current.spans = spans.filter((s) => s.text.length > 0);
    if (current.spans.some((s) => s.text.trim().length > 0)) blocks.push(current);
    current = null;
  };
  const open = (block: IRichBlock) => {
    close();
    current = block;
  };
  const push = (text: string) => {
    if (!current) current = { kind: "p", spans: [] };
    const s = style();
    const last = current.spans[current.spans.length - 1];
    const same = last && JSON.stringify({ ...last, text: "" }) === JSON.stringify({ ...s, text: "" });
    if (same) last.text += text;
    else current.spans.push({ ...s, text });
  };

  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|</g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const [whole, slash, rawTag, attrs, text] = m;
    if (whole.startsWith("<!--")) continue;
    if (text !== undefined || whole === "<") {
      if (skip) continue;
      const decoded = decodeEntities(text ?? "<");
      const collapsed = pre ? decoded : decoded.replace(/\s+/g, " ");
      // Whitespace between blocks is formatting, not content.
      if (!pre && !current && collapsed.trim() === "") continue;
      push(collapsed);
      continue;
    }

    const tag = rawTag.toLowerCase();
    const closing = slash === "/";
    if (tag === "script" || tag === "style") {
      skip += closing ? -1 : 1;
      skip = Math.max(skip, 0);
      continue;
    }
    if (skip) continue;

    if (tag in INLINE_TAGS) {
      if (closing) {
        const at = inline.map((i) => i.tag).lastIndexOf(tag);
        if (at >= 0) inline.splice(at, 1);
      } else {
        inline.push({ tag, style: { [INLINE_TAGS[tag]]: true } });
      }
      continue;
    }
    if (tag === "a") {
      if (closing) {
        const at = inline.map((i) => i.tag).lastIndexOf("a");
        if (at >= 0) inline.splice(at, 1);
      } else {
        const href = attr(attrs, "href");
        inline.push({ tag, style: href && SAFE_HREF.test(href) ? { href } : {} });
      }
      continue;
    }
    if (tag === "br") {
      push("\n");
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      close();
      if (closing) lists.pop();
      else lists.push({ ordered: tag === "ol", count: 0 });
      continue;
    }
    if (tag === "li") {
      if (closing) {
        close();
        continue;
      }
      const list = lists[lists.length - 1] ?? { ordered: false, count: 0 };
      list.count += 1;
      open({ kind: "li", spans: [], depth: Math.max(lists.length, 1), marker: list.ordered ? `${list.count}.` : "•" });
      continue;
    }
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      if (closing) close();
      else open({ kind: "heading", level: Number(heading[1]), spans: [] });
      continue;
    }
    if (tag === "pre") {
      if (closing) {
        pre = Math.max(pre - 1, 0);
        close();
      } else {
        pre += 1;
        open({ kind: "pre", spans: [] });
      }
      continue;
    }
    if (tag === "blockquote") {
      if (closing) close();
      else open({ kind: "quote", spans: [] });
      continue;
    }
    if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "header" || tag === "footer") {
      // A paragraph inside a list item or quote continues that block instead of starting a new one.
      const host = current as IRichBlock | null;
      if (host && (host.kind === "li" || host.kind === "quote")) {
        if (!closing && host.spans.length) push("\n");
        continue;
      }
      if (closing) close();
      else open({ kind: "p", spans: [] });
      continue;
    }
    if (tag === "hr") close();
  }
  close();
  return blocks;
}

/** True when the HTML has something to show once parsed. */
export function hasRichText(input: string | null | undefined): boolean {
  return !!input && parseRichText(input).length > 0;
}
