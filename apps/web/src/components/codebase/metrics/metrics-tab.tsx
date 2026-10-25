"use client";

import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { useCodeMetrics } from "@/hooks/code/use-code-metrics";
import { useIndexStatus } from "@/hooks/code/use-index-status";
import { EIndexStatus } from "@/types";

import { ChurnComplexityScatter } from "./churn-complexity-scatter";
import { ComplexityHistogram } from "./complexity-histogram";
import { HotspotTreemap } from "./hotspot-treemap";
import { LanguageDonut } from "./language-donut";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function MetricsTab({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { status } = useIndexStatus(workspaceSlug, projectId);
  const isReady = status === EIndexStatus.Ready;
  const { data: metrics, isLoading, isError, refetch } = useCodeMetrics(
    workspaceSlug,
    projectId,
    isReady,
  );

  if (!isReady) {
    return (
      <EmptyState
        assetKey="generic"
        title="Index the repo to see metrics"
        description="Static code metrics (size, complexity, duplication, hotspots) are computed from the codebase index."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
        Loading metrics…
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load code metrics"
        description="Something went wrong fetching the metrics summary. Please try again."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  if (!metrics || metrics.totals.files === 0) {
    return (
      <EmptyState
        assetKey="generic"
        title="No metrics yet"
        description="This project's metrics summary is empty."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-1">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Files</p>
          <p className="text-lg font-semibold text-foreground">{metrics.totals.files.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Lines of code</p>
          <p className="text-lg font-semibold text-foreground">{metrics.totals.loc.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Duplication</p>
          {metrics.duplication.percent === null ? (
            <p
              className="text-lg font-semibold text-muted-foreground"
              title="Duplication wasn't measured for this index — the scanner was unavailable. This is not the same as 0%."
            >
              —
            </p>
          ) : (
            <p className="text-lg font-semibold text-foreground">
              {metrics.duplication.percent.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 @min-[56rem]:grid-cols-2">
        <Panel title="Hotspots (complexity x churn)">
          {metrics.hotspots.length > 0 ? (
            <HotspotTreemap hotspots={metrics.hotspots} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              History not available — this repo was shallow-cloned, so churn (and hotspots) can't be
              computed yet.
            </p>
          )}
        </Panel>

        <Panel title="Churn vs complexity">
          {metrics.hotspots.length > 0 ? (
            <ChurnComplexityScatter hotspots={metrics.hotspots} />
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              History not available — churn requires full commit history.
            </p>
          )}
        </Panel>

        <Panel title="Function complexity">
          <ComplexityHistogram buckets={metrics.complexity.buckets} />
        </Panel>

        <Panel title="Lines of code by language">
          <LanguageDonut languages={metrics.languages} />
          {/* The fallback scanner is a real but narrower measurement, so it renders a
              donut that looks exactly as authoritative as scc's. Say which one this is
              (GIN-135) — same reason churn says "History not available" above. */}
          {metrics.languages_source === "file_scan" ? (
            <p className="mt-3 text-xs text-amber-500">
              Approximate — the language scanner was unavailable, so only 11 file types were
              counted and totals include comments and blank lines.
            </p>
          ) : null}
        </Panel>
      </div>

      {metrics.dependencies.cycles.length > 0 ? (
        <Panel title="Dependency cycles">
          <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            {metrics.dependencies.cycles.map((c) => (
              <li key={c.modules.join(" -> ")} className="font-mono">
                {c.modules.join(" → ")}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
