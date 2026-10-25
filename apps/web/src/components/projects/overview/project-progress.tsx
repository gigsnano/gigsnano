"use client";

import { useProjectStoriesPage } from "@/hooks/story/use-stories";
import { EStoryStatus } from "@/types";
import { cn } from "@/lib/utils";

const SEGMENTS: { status: EStoryStatus; label: string; bar: string; dot: string }[] = [
  { status: EStoryStatus.Todo, label: "To do", bar: "bg-muted-foreground/25", dot: "bg-muted-foreground/50" },
  { status: EStoryStatus.InProgress, label: "In progress", bar: "bg-blue-500", dot: "bg-blue-500" },
  { status: EStoryStatus.InReview, label: "In review", bar: "bg-amber-500", dot: "bg-amber-500" },
  { status: EStoryStatus.Done, label: "Done", bar: "bg-emerald-500", dot: "bg-emerald-500" },
];

function useStatusCount(
  workspaceSlug: string,
  projectId: string,
  status: EStoryStatus,
) {
  return useProjectStoriesPage(workspaceSlug, projectId, {
    product_only: true,
    status,
    limit: 1,
    offset: 0,
  });
}

/** Sleek Progress block — a stacked bar + per-status legend with count and %. */
export function ProjectProgress({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const todo = useStatusCount(workspaceSlug, projectId, EStoryStatus.Todo);
  const inProgress = useStatusCount(workspaceSlug, projectId, EStoryStatus.InProgress);
  const inReview = useStatusCount(workspaceSlug, projectId, EStoryStatus.InReview);
  const done = useStatusCount(workspaceSlug, projectId, EStoryStatus.Done);

  const queries = [todo, inProgress, inReview, done];
  const isPending = queries.some((q) => q.isPending);
  const counts = SEGMENTS.map((s, i) => ({
    ...s,
    count: queries[i]?.data?.total ?? 0,
  }));
  const total = counts.reduce((sum, s) => sum + s.count, 0);

  return (
    <section className="mt-12 border-t pt-6">
      <h2 className="text-sm font-semibold text-foreground">Progress</h2>

      {isPending ? (
        <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-muted" />
      ) : total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No work items yet — progress appears here as stories are created.
        </p>
      ) : (
        <>
          <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {counts.map((s) =>
              s.count > 0 ? (
                <div
                  key={s.status}
                  className={cn("h-full", s.bar)}
                  style={{ width: `${(s.count / total) * 100}%` }}
                  title={`${s.label}: ${s.count}`}
                />
              ) : null,
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {counts.map((s) => {
              const pct = total ? Math.round((s.count / total) * 100) : 0;
              return (
                <div key={s.status} className="flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", s.dot)} />
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                  <span className="ml-auto text-sm tabular-nums text-foreground">
                    {s.count}
                    <span className="ml-1 text-xs text-muted-foreground">{pct}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
