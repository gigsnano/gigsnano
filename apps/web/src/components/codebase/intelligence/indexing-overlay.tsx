"use client";

/**
 * Blocks the Codebase workspace while the repo is being indexed (GIN-120).
 *
 * Before this, indexing announced itself only as a small "Indexing…" chip in the
 * header while the rest of the screen stayed live: the tabs, the graph toolbar,
 * Ask Codebase, and an explorer tree that falls back to fixture data when the
 * real graph is absent — so the tools looked usable and answered about nothing.
 *
 * Deliberately indeterminate. The backend reports a status, not progress, so a
 * staged or percentage loader would be inventing detail we don't have. (The
 * neighbouring IndexingProgress does exactly that — four stages with `current`
 * hardcoded — which is survivable for a sub-second graph fetch but would sit and
 * lie for minutes here.) A spinner and an honest sentence is the whole job.
 */
export function IndexingOverlay({ repo }: { repo?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm"
    >
      <span
        aria-hidden
        className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
      />
      <div className="max-w-xs text-center">
        <p className="text-sm font-medium text-foreground">
          Indexing {repo ?? "this repository"}…
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Building the symbol graph. This can take a few minutes on a large repo —
          the codebase tools unlock as soon as it finishes.
        </p>
      </div>
    </div>
  );
}
