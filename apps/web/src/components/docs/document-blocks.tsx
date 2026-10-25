import { renderSimpleMarkdown, type DocBlock } from "@/lib/docs/markdown";
import { MermaidDiagram } from "./mermaid-diagram";

/** A non-mermaid fenced code block, styled to match the app's code surfaces. */
function CodeFence({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-md border bg-muted/40">
      {lang ? (
        <div className="border-b bg-muted/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {lang}
        </div>
      ) : null}
      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** A content-derived React key for a document block, so list identity tracks the
 *  block's text rather than its array position (blocks can be re-parsed as the
 *  document is edited). Index is appended only to disambiguate repeats. */
export function docBlockKey(block: DocBlock, index: number): string {
  const body = block.kind === "code" ? `${block.lang}:${block.code}` : block.text;
  return `${block.kind}:${index}:${body.slice(0, 32)}`;
}

/**
 * Renders a single document block: prose as markdown, a `mermaid` fence as a
 * rendered diagram, and any other fence as a styled code block. Shared by the
 * document detail reviewer and the issue document peek so both viewers render
 * diagrams identically (GIN-41).
 */
export function DocBlockView({ block }: { block: DocBlock }) {
  if (block.kind === "code") {
    return block.lang === "mermaid" ? (
      <MermaidDiagram source={block.code} />
    ) : (
      <CodeFence lang={block.lang} code={block.code} />
    );
  }
  return (
    <div
      className="prose-sm max-w-none [&_strong]:font-semibold"
      dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(block.text) }}
    />
  );
}
