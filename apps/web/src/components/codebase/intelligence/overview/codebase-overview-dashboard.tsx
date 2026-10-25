import { useEffect } from "react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { EmptyState } from "@/components/empty-state";
import { useCodebaseOverview } from "@/hooks/codebase/use-codebase-overview";
import { useStartIndex } from "@/hooks/code/use-index-status";
import { codebaseAnalytics } from "@/lib/analytics";
import type { CodebaseViewId } from "@/types/code/intelligence";

import { AICodebaseSummary } from "./ai-summary";
import { ArchitectureMap } from "./architecture-map";
import { AttentionNeeded } from "./attention-needed";
import { CountsStrip } from "./counts-strip";
import { CodebaseHealthSummary } from "./health-summary";
import { CodebaseQuickPaths } from "./quick-paths";
import { RecentChanges } from "./recent-changes";
import { TopModules } from "./top-modules";

/** GIN-271 — the redesigned Codebase Overview: an actionable dashboard that answers
 * "what is this, is it healthy, how is it built, what's at risk, what changed"
 * without touching a graph. Composes the eight sections over one aggregation request
 * (`useCodebaseOverview`); every section renders its own honest state, so the page
 * is usable in every index state (none/indexing/failed/stale/ready). */
export function CodebaseOverviewDashboard({
  workspaceSlug,
  projectId,
  onOpenView,
  onAsk,
}: {
  workspaceSlug: string;
  projectId: string;
  onOpenView: (view: CodebaseViewId) => void;
  onAsk: () => void;
}) {
  const { data, isLoading, isError, refetch } = useCodebaseOverview(workspaceSlug, projectId);
  const startIndex = useStartIndex(workspaceSlug, projectId);

  // Analytics (GIN-281) — fire once per state transition, not per poll tick.
  const overviewState = data?.state;
  useEffect(() => {
    if (overviewState) codebaseAnalytics.overviewLoaded(projectId, overviewState);
  }, [projectId, overviewState]);
  useEffect(() => {
    if (isError) codebaseAnalytics.overviewError(projectId);
  }, [projectId, isError]);

  // Drill-downs and Ask are tracked here; quick paths self-report their own event.
  const openView = (view: CodebaseViewId) => {
    codebaseAnalytics.drilldown(projectId, view);
    onOpenView(view);
  };
  const ask = () => {
    codebaseAnalytics.askOpened(projectId);
    onAsk();
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 sm:p-6" aria-busy>
        <div className="h-16 animate-pulse rounded-xl border bg-muted/40" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border bg-muted/40"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load the overview"
          description="Something went wrong fetching the codebase overview."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 sm:p-6">
      <CountsStrip data={data} onOpenView={openView} />

      {data.state === "failed" ? (
        <div className="gn-dash-card flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-red-600 dark:text-red-400">Indexing failed</p>
            <p className="mt-0.5 truncate text-muted-foreground">
              {data.index.error ?? "The last index build did not complete."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => startIndex.mutate()}
            disabled={startIndex.isPending}
            className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {startIndex.isPending ? "Re-indexing…" : "Re-index"}
          </button>
        </div>
      ) : null}

      {data.state === "none" ? (
        <div className="gn-dash-card rounded-xl border bg-card p-6 text-center">
          <p className="text-sm font-medium">This repository isn&apos;t indexed yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Index it to unlock health, architecture, risks, and change insight — no graph wrangling
            required.
          </p>
          <button
            type="button"
            onClick={() => startIndex.mutate()}
            disabled={startIndex.isPending}
            className="mt-3 inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:opacity-60"
          >
            {startIndex.isPending ? "Starting…" : "Index this repository"}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <CodebaseHealthSummary health={data.health} onOpenView={openView} index={0} />
        <ArchitectureMap modules={data.modules} onOpenView={openView} index={1} />
        <AICodebaseSummary overview={data} onAsk={ask} onOpenView={openView} index={2} />
        <AttentionNeeded risks={data.risks} onOpenView={openView} index={3} />
        <TopModules modules={data.modules} onOpenView={openView} index={4} />
        <RecentChanges changes={data.changes} index={5} />
      </div>

      <CodebaseQuickPaths projectId={projectId} onOpenView={onOpenView} onAsk={onAsk} />
    </div>
  );
}
