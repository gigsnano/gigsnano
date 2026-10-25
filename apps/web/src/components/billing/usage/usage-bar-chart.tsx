import { formatCostCents } from "@/lib/ai-cost/format";
import type { IUsageTimeseriesPoint } from "@/types/billing/ai-cost";

/** Calm cost-over-time bars using flex heights — no chart library. */
export function UsageBarChart({ points }: { points: IUsageTimeseriesPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.cost_cents));
  return (
    <div className="flex h-28 items-end gap-1" role="img" aria-label="AI cost over time">
      {points.map((p) => (
        <div key={p.date} className="group relative flex flex-1 flex-col items-center justify-end">
          <div
            className="w-full rounded-sm bg-primary/70 transition-[height,background-color] duration-300 ease-out group-hover:bg-primary"
            style={{ height: `${Math.max(4, (p.cost_cents / max) * 100)}%` }}
          />
          <span className="pointer-events-none absolute -top-5 hidden rounded bg-popover px-1.5 py-0.5 text-[10px] tabular-nums text-popover-foreground shadow group-hover:block">
            {formatCostCents(p.cost_cents)}
          </span>
        </div>
      ))}
    </div>
  );
}
