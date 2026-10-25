"use client";

import { cn } from "@/lib/utils";
import type { ICodebaseMetric } from "@/types/code/intelligence";

/**
 * Compact, inline metric bar (NOT big dashboard cards). Each metric is a button
 * that applies its graph filter on click; warn/danger metrics carry a tone dot.
 */
export function CodebaseMetricBar({
  metrics,
  activeKey,
  onFilter,
}: {
  /** Null until the code graph loads. It used to fall back to fixture counts, so a
   * loading project showed "Files 508 · Classes 214 · Functions 1340" for a repo that
   * wasn't yours (GIN-158). Render nothing rather than a number we don't have. */
  metrics: ICodebaseMetric[] | null;
  activeKey?: string;
  onFilter: (metric: ICodebaseMetric) => void;
}) {
  if (!metrics) return null;

  return (
    <div
      role="group"
      aria-label="Codebase summary metrics"
      className="flex flex-wrap items-center gap-1"
    >
      {metrics.map((m) => {
        const clickable = Boolean(m.filter);
        const active = activeKey === m.key;
        return (
          <button
            key={m.key}
            type="button"
            disabled={!clickable}
            aria-pressed={active}
            onClick={() => clickable && onFilter(m)}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              clickable ? "hover:bg-accent" : "cursor-default opacity-90",
              active && "border-primary/50 bg-accent",
            )}
            style={{ transitionTimingFunction: "var(--ease-out)" }}
          >
            {m.tone === "warn" ? (
              <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
            ) : m.tone === "danger" ? (
              <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
            ) : null}
            <span className="text-muted-foreground group-hover:text-foreground">{m.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{m.value}</span>
          </button>
        );
      })}
    </div>
  );
}
