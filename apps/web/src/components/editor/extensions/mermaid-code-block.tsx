"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import CodeBlock from "@tiptap/extension-code-block";

import { isDarkTheme, renderMermaid } from "@/lib/mermaid";

/**
 * A code block whose editable source stays, plus a live rendered preview when
 * the language is `mermaid` (GIN-78: mermaid diagrams weren't rendering). Any
 * other language behaves like a normal code block. mermaid is dynamically
 * imported so it only loads when a diagram is actually present.
 */
function MermaidView({ node }: NodeViewProps) {
  const isMermaid = node.attrs.language === "mermaid";
  const code = node.textContent;
  const rawId = useId();
  const domId = `mmd-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isMermaid) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    // Guards a slow render from overwriting a newer one. The read-only viewer
    // always had this; the editor did not, so typing quickly could leave the
    // preview showing an older diagram than the source directly above it.
    let cancelled = false;
    const source = code.trim();

    // All state updates run inside the (async) timer callback — never
    // synchronously in the effect body — so they don't cascade renders.
    timerRef.current = setTimeout(() => {
      void renderMermaid(source, { id: domId, dark: isDarkTheme() }).then((result) => {
        if (cancelled) return;
        setSvg(result.svg ?? "");
        setError(result.error);
      });
    }, 300);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, isMermaid, domId]);

  return (
    <NodeViewWrapper className="gn-code-node">
      <pre spellCheck={false}>
        <NodeViewContent />
      </pre>
      {isMermaid ? (
        <div className="gn-mermaid-preview" contentEditable={false}>
          {error ? (
            <span className="gn-mermaid-error">Diagram error: {error}</span>
          ) : svg ? (
            // mermaid strict-mode output is sanitized before it reaches this sink.
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span className="gn-mermaid-empty">Write mermaid syntax above to preview…</span>
          )}
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

/** StarterKit's CodeBlock + a React node view that live-renders mermaid diagrams. */
export const MermaidCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(MermaidView);
  },
});
