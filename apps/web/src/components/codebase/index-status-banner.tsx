"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useIndexStatus, useStartIndex } from "@/hooks/code/use-index-status";
import { queryKeys } from "@/hooks/query-keys";
import { EIndexStatus } from "@/types";

/**
 * Compact codebase index / staleness control — a status chip + an Index/Re-index
 * button, sized to sit inline in the Codebase toolbar (rather than a separate
 * full-width banner strip). Stays visible in `Ready` too, since that's where the
 * indexed commit shows.
 */
export function IndexStatusBanner({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: project, status: rawStatus, error, commitSha } = useIndexStatus(workspaceSlug, projectId);
  const startIndex = useStartIndex(workspaceSlug, projectId);
  const queryClient = useQueryClient();

  // A project that loaded but carries no index_status (older backend / a project
  // created before the index columns existed) is treated as un-indexed, so the
  // "Index this repo" action is always reachable rather than silently hidden.
  const status = rawStatus ?? (project ? EIndexStatus.None : undefined);

  useEffect(() => {
    if (status !== EIndexStatus.Pending && status !== EIndexStatus.Indexing) return;
    const t = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceSlug, projectId) });
    }, 3000);
    return () => clearInterval(t);
  }, [status, queryClient, workspaceSlug, projectId]);

  if (!status) return null;

  const isIndexing = status === EIndexStatus.Pending || status === EIndexStatus.Indexing;
  const isFailed = status === EIndexStatus.Failed;
  const isReady = status === EIndexStatus.Ready;
  const needsIndex = status === EIndexStatus.None || isFailed;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground",
          isFailed && "text-destructive",
        )}
        title={isFailed && error ? error : undefined}
      >
        {isIndexing ? (
          <span
            aria-hidden="true"
            className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
          />
        ) : null}
        {status === EIndexStatus.None ? "Not indexed" : null}
        {isIndexing ? "Indexing…" : null}
        {isFailed ? "Index failed" : null}
        {isReady ? (
          <>
            Indexed
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              {commitSha?.slice(0, 7) ?? "unknown"}
            </code>
          </>
        ) : null}
      </span>
      {needsIndex || isReady ? (
        <button
          type="button"
          disabled={startIndex.isPending}
          onClick={() => startIndex.mutate()}
          className="rounded-md border px-2.5 py-1 font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          {startIndex.isPending
            ? isReady
              ? "Syncing…"
              : "Starting…"
            : isReady
              ? "Re-index"
              : "Index this repo"}
        </button>
      ) : null}
    </div>
  );
}
