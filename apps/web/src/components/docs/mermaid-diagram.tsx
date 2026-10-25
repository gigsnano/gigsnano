"use client";

import { useEffect, useId, useState } from "react";

import { isDarkTheme, renderMermaid } from "@/lib/mermaid";
import { DiagramZoomViewer } from "./diagram-zoom-viewer";

/**
 * Renders a `mermaid` diagram from its source, for the read-only document viewer.
 *
 * mirrors the editor node view's security posture (`securityLevel: "strict"`
 * sanitizes the generated SVG before it reaches the HTML sink) and re-renders
 * when the app's light/dark theme flips so the diagram never looks out of place.
 */
export function MermaidDiagram({ source }: { source: string }) {
  const rawId = useId();
  const domId = `mmd-doc-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(isDarkTheme);

  // Track theme flips (the app toggles `.dark` on <html>) so diagrams re-theme.
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setDark(isDarkTheme()));
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const src = source.trim();

  useEffect(() => {
    // Empty source renders nothing (handled below) — no synchronous state reset
    // in the effect body; stale svg is ignored because render gates on `src`.
    if (!src) return;
    let cancelled = false;
    void renderMermaid(src, { id: domId, dark }).then((result) => {
      if (cancelled) return;
      setSvg(result.svg ?? "");
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [src, domId, dark]);

  if (!src) return null;

  if (error) {
    return (
      <div className="my-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        Diagram error: {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-3 rounded-md border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
        Rendering diagram…
      </div>
    );
  }

  // mermaid strict-mode output is sanitized before it reaches the HTML sink; the
  // viewer adds zoom / pan / full-screen so large diagrams aren't cramped (GIN-105).
  return <DiagramZoomViewer html={svg} className="my-3" />;
}
