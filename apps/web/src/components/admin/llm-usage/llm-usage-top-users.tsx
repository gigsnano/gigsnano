import type { ILlmUsageMatrixRow, ILlmUsageRankedRow } from "@/types";

import { formatTokenCount, formatUsd } from "./format-source";
import { LlmUsageMiniStrip } from "./llm-usage-mini-strip";
import type { TLlmUsageMetric } from "./llm-usage-mix-panel";

interface ILlmUsageTopUsersProps {
  rows: ILlmUsageRankedRow[];
  strips: ILlmUsageMatrixRow[];
  metric: TLlmUsageMetric;
  activeUserId?: string;
  onSelectUser: (userId: string | undefined) => void;
}

export function LlmUsageTopUsers({
  rows,
  strips,
  metric,
  activeUserId,
  onSelectUser,
}: ILlmUsageTopUsersProps) {
  const stripById = new Map(strips.map((row) => [row.id, row]));

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium text-foreground">Top users</h2>
      <div className="space-y-2">
        {rows.slice(0, 10).map((row, index) => {
          const selected = activeUserId === row.id;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectUser(selected ? undefined : row.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:bg-muted/40"
              style={{ borderColor: selected ? "var(--ring)" : undefined }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {index + 1}. {row.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {metric === "cost" ? formatUsd(row.estimated_cost_usd) : formatTokenCount(row.total_tokens)}
                </p>
              </div>
              <LlmUsageMiniStrip days={stripById.get(row.id)?.days ?? []} metric={metric} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
