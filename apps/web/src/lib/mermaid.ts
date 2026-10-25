// Load mermaid once, lazily — kept at module scope so the dynamic import() lives
// outside any component (React Compiler can't lower an import expression inside
// a component body). Shared by the editor node view and the document viewer so
// the diagram engine is imported at most once per session.
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

export function loadMermaid() {
  if (!mermaidPromise) mermaidPromise = import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

/**
 * Upper bound on diagram source we will hand to mermaid.
 *
 * Mermaid parses and lays out synchronously on the main thread, so a
 * pathological diagram doesn't fail — it freezes the tab. This is far above any
 * hand-written diagram and exists only to stop a hostile or accidentally
 * generated document from taking the editor down with it.
 */
export const MERMAID_MAX_SOURCE = 20_000;

/** Which theme mermaid should draw with, read from the class the app toggles. */
export function isDarkTheme() {
  return (
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );
}

export type TMermaidResult = { svg: string; error: null } | { svg: null; error: string };

/** The last theme handed to `initialize`, so it is only re-applied when it changes. */
let configuredTheme: "dark" | "default" | null = null;

/**
 * Render diagram source to sanitized SVG.
 *
 * One function for both the editor node view and the read-only document viewer.
 * They had separate copies that had already drifted: the viewer guarded against
 * a slow render overwriting a newer one, the editor did not — so typing quickly
 * could leave the preview showing an older diagram than the source above it.
 *
 * `securityLevel: "strict"` is what sanitizes the output — it disables inline
 * scripts, event handlers and foreign objects in the generated SVG. Set here
 * rather than at each call site so a future caller cannot forget it, and
 * `initialize` runs only when the theme actually changes, since mermaid's config
 * is process-global mutable state.
 *
 * Never throws and never returns partial output: a caller renders either a
 * diagram or a readable error, and the source itself is always kept.
 */
export async function renderMermaid(
  source: string,
  { id, dark }: { id: string; dark: boolean },
): Promise<TMermaidResult> {
  const trimmed = source.trim();
  if (!trimmed) return { svg: "", error: null };

  if (trimmed.length > MERMAID_MAX_SOURCE) {
    return {
      svg: null,
      error: `Diagram is too large to render (${trimmed.length} characters, limit ${MERMAID_MAX_SOURCE}).`,
    };
  }

  try {
    const mermaid = await loadMermaid();
    const theme = dark ? "dark" : "default";
    if (configuredTheme !== theme) {
      mermaid.initialize({ startOnLoad: false, theme, securityLevel: "strict" });
      configuredTheme = theme;
    }
    const { svg } = await mermaid.render(id, trimmed);
    return { svg, error: null };
  } catch (e: unknown) {
    return { svg: null, error: e instanceof Error ? e.message : "Invalid diagram" };
  }
}
