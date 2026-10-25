// Rewrite SP3's inline citations ([relpath:start-end], [doc:Title]) into
// #gigs-cite fragment links the chat `a`-override renders as interactive pills.
// Fragment (#) href survives markdown URL-sanitization; payload is encodeURIComponent'd.

const CODE_RE = /\[([\w./-]+):(\d+)-(\d+)\](?!\()/g; // (?!\() skips real markdown links
const DOC_RE = /\[doc:([^\]\n]+)\](?!\()/g;

function encode(kind: "code" | "doc", payload: string): string {
  return `#gigs-cite:${kind}:${encodeURIComponent(payload)}`;
}

function transformSegment(seg: string): string {
  return seg
    .replace(DOC_RE, (_m, title: string) => `[doc:${title}](${encode("doc", title)})`)
    .replace(CODE_RE, (_m, path: string, s: string, e: string) =>
      `[${path}:${s}-${e}](${encode("code", `${path}:${s}-${e}`)})`,
    );
}

export function transformCitations(text: string): string {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      // Split on inline-code spans; even-indexed parts are OUTSIDE code.
      return line
        .split("`")
        .map((part, i) => (i % 2 === 0 ? transformSegment(part) : part))
        .join("`");
    })
    .join("\n");
}

export type CitationSpec =
  | { kind: "code"; path: string; start: number; end: number }
  | { kind: "doc"; title: string };

export function parseCitationHref(href: string): CitationSpec | null {
  const prefix = "#gigs-cite:";
  if (!href.startsWith(prefix)) return null;
  const rest = href.slice(prefix.length);
  const colon = rest.indexOf(":");
  if (colon === -1) return null;
  const kind = rest.slice(0, colon);
  const payload = decodeURIComponent(rest.slice(colon + 1));
  if (kind === "doc") return payload ? { kind: "doc", title: payload } : null;
  if (kind === "code") {
    const lastColon = payload.lastIndexOf(":");
    if (lastColon <= 0) return null;
    const path = payload.slice(0, lastColon);
    const [s, e] = payload.slice(lastColon + 1).split("-");
    const start = Number(s);
    const end = Number(e);
    if (!path || !Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { kind: "code", path, start, end };
  }
  return null;
}
