import { formatCostCents } from "@/lib/ai-cost/format";
import type { IUsageBreakdownEntry } from "@/types/billing/ai-cost";

/** A grouped-by-{project|agent|member} cost list with proportional bars. */
export function UsageBreakdown({
  title,
  entries,
}: {
  title: string;
  entries: IUsageBreakdownEntry[];
}) {
  const max = Math.max(1, ...entries.map((e) => e.cost_cents));
  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-foreground">{e.name}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                style={{ width: `${Math.max(2, (e.cost_cents / max) * 100)}%` }}
              />
            </span>
            <span className="w-16 shrink-0 text-right text-sm tabular-nums text-foreground">
              {formatCostCents(e.cost_cents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
