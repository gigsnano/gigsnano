"use client";

import { CODEBASE_VIEWS } from "@/constants/codebase-views";
import { cn } from "@/lib/utils";
import type { CodebaseViewId } from "@/types/code/intelligence";

// Same list the `?view=` parser validates against — see constants/codebase-views.
const TABS = CODEBASE_VIEWS;

/** Primary view switcher. Keyboard: arrow keys move focus/selection. */
export function CodebaseViewTabs({
  view,
  onChange,
}: {
  view: CodebaseViewId;
  onChange: (v: CodebaseViewId) => void;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === view);
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length;
    onChange(TABS[next].id);
  }

  return (
    <div
      role="tablist"
      aria-label="Codebase view"
      onKeyDown={onKeyDown}
      className="inline-flex w-fit items-center gap-0.5 overflow-x-auto rounded-lg border bg-muted/40 p-1"
    >
      {TABS.map((t) => {
        const active = view === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            style={{ transitionTimingFunction: "var(--tabs-ease)", transitionDuration: "200ms" }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
