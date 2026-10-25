"use client";

import { useState } from "react";

import { useDeliveryMetrics } from "@/hooks/project/use-forecasting";
import { cn } from "@/lib/utils";
import type { IThroughputBucket } from "@/types";

function fmtShort(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Delivery-vs-plan / throughput trend (GIN-340). Reads the backend delivery
 *  metrics (completions per period) — no calculation in React — and renders a
 *  compact bar trend with a keyboard-reachable table alternative for the same
 *  numbers (charts must have an accessible equivalent). */
export function ProjectDelivery({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useDeliveryMetrics(workspaceSlug, projectId);
  const [showTable, setShowTable] = useState(false);

  const throughput: IThroughputBucket[] = data?.throughput ?? [];
  const total = throughput.reduce((n, b) => n + b.completed, 0);
  const max = Math.max(1, ...throughput.map((b) => b.completed));
  const cycle = data?.cycle_time;

  return (
    <section className="mt-10 border-t pt-6" aria-labelledby="project-delivery-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="project-delivery-heading" className="text-sm font-semibold text-foreground">
          Delivery trend
        </h2>
        {total > 0 ? (
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
            aria-expanded={showTable}
          >
            {showTable ? "Show chart" : "Show table"}
          </button>
        ) : null}
      </div>

      {isPending ? (
        <div className="mt-4 h-20 w-full animate-pulse rounded-lg bg-muted" />
      ) : isError ? (
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          Couldn&apos;t load delivery metrics.
          <button type="button" onClick={() => refetch()} className="font-medium text-primary hover:underline">
            Retry
          </button>
        </div>
      ) : total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No completed work recorded yet — throughput appears here as items reach Done.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            {total} completed over the last {throughput.length} weeks
            {cycle && cycle.samples > 0 && cycle.p50_days != null ? (
              <>
                {" · "}median cycle {cycle.p50_days}d
                {cycle.p85_days != null ? <> · 85th {cycle.p85_days}d</> : null}
              </>
            ) : null}
          </p>

          {showTable ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-1 font-medium">Week of</th>
                  <th className="pb-1 text-right font-medium">Completed</th>
                </tr>
              </thead>
              <tbody>
                {throughput.map((b) => (
                  <tr key={b.period_start} className="border-t">
                    <td className="py-1 tabular-nums text-muted-foreground">{fmtShort(b.period_start)}</td>
                    <td className="py-1 text-right tabular-nums text-foreground">{b.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              className="mt-4 flex h-20 items-end gap-1"
              role="img"
              aria-label={`Weekly throughput trend: ${throughput.map((b) => b.completed).join(", ")} items completed over ${throughput.length} weeks.`}
            >
              {throughput.map((b) => (
                <div
                  key={b.period_start}
                  className="group flex h-full flex-1 items-end"
                  title={`Week of ${fmtShort(b.period_start)}: ${b.completed} completed`}
                >
                  <div
                    className={cn(
                      "w-full rounded-t bg-primary/60 transition-colors group-hover:bg-primary",
                      b.completed === 0 && "bg-muted",
                    )}
                    style={{ height: `${Math.max(b.completed === 0 ? 2 : 6, (b.completed / max) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
