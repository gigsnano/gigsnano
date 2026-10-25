import { cn } from "@/lib/utils";
import type { IIndexQuality } from "@/lib/code/real-intelligence";

/** Compact, honest one-liner: is the graph actually trustworthy right now? */
function formatCompact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function IndexQualityStrip({ quality }: { quality: IIndexQuality }) {
  if (quality.level === "none") return null;

  const message =
    quality.level === "healthy"
      ? `Healthy · ${quality.symbols.toLocaleString()} symbols · ${formatCompact(quality.relationships)} relationships`
      : quality.level === "degraded"
        ? "Structural-only — precise call edges unavailable"
        : "Partial index — 0 symbols · Re-index";

  return (
    <div
      aria-live="polite"
      className={cn(
        "text-xs",
        quality.level === "healthy" && "text-muted-foreground",
        quality.level === "degraded" && "text-amber-500",
        quality.level === "partial" && "text-destructive",
      )}
    >
      {message}
    </div>
  );
}
