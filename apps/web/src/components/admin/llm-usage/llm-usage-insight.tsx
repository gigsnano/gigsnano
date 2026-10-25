import type { ILlmUsageSummary } from "@/types";

import { formatLlmUsageOperation, formatTokenCount } from "./format-source";

function pct(delta: number | null | undefined) {
  if (typeof delta !== "number" || Number.isNaN(delta)) return "0%";
  const rounded = Math.round(Math.abs(delta));
  return `${rounded}%`;
}

export function LlmUsageInsight({ summary }: { summary: ILlmUsageSummary | null | undefined }) {
  const operations = Object.entries(summary?.by_operation ?? {});
  const top = operations.sort((a, b) => b[1].tokens - a[1].tokens)[0];
  const delta = summary?.prior_period?.delta_tokens_pct ?? 0;
  const trend = delta >= 0 ? "up" : "down";

  if (!top) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Usage insight appears once LLM events are available.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      {formatLlmUsageOperation(top[0])} drove {formatTokenCount(top[1].tokens)} tokens this period, {trend}{" "}
      {pct(delta)} vs prior.
    </div>
  );
}
