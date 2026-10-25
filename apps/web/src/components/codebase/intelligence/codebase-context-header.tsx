"use client";

import { Suspense } from "react";
import Link from "next/link";
import { CheckmarkCircle02Icon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { CodebaseHeaderActions } from "@/components/codebase/intelligence/codebase-header-actions";
import { CodebaseViewTabs } from "@/components/codebase/intelligence/codebase-view-tabs";
import { CodebaseTabs as CodebaseSectionTabs } from "@/components/codebase/system/codebase-tabs";
import { relativeTime } from "@/lib/format/relative-time";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/project/use-projects";
import { useCodebaseWorkspace } from "@/hooks/codebase/use-codebase-workspace";
import { EIndexStatus } from "@/types";

/**
 * GIN-273 — the single Codebase context header. Collapses what used to be three
 * stacked bands (global breadcrumb bar → repo-metadata strip → tab row) into ONE
 * region beneath the global GigsNano bar: back-context + title + repo/index meta +
 * actions on top, the attached view tabs below. Mounted by ProjectHeader in place
 * of the generic AppHeader for `/codebase`, so exactly two app-level horizontal
 * regions exist beneath browser chrome.
 */
export function CodebaseContextHeader({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: project } = useProject(workspaceSlug, projectId);

  return (
    <header className="@container/cbh flex shrink-0 flex-col border-b">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm @max-xl/cbh:hidden">
            <Link
              href={`/${workspaceSlug}/projects`}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              Projects
            </Link>
            <span className="text-muted-foreground/40" aria-hidden>
              /
            </span>
            <Link
              href={`/${workspaceSlug}/projects/${projectId}`}
              className="max-w-[10rem] truncate text-muted-foreground transition-colors hover:text-foreground"
            >
              {project?.name ?? "…"}
            </Link>
          </nav>
          <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
          <h1 className="shrink-0 text-sm font-semibold">Codebase</h1>

          {/* Repo + index meta — honest states, never "Indexed unknown". Hidden on
              narrow widths so the primary action stays visible (AC). */}
          <RepoMeta
            repo={project?.repo_full_name ?? null}
            branch={project?.repo_default_branch ?? null}
            status={project?.index_status}
            indexedAt={project?.indexed_at ?? null}
          />
        </div>

        <div className="shrink-0">
          <CodebaseHeaderActions workspaceSlug={workspaceSlug} projectId={projectId} />
        </div>
      </div>

      {/* Phones: each tab row scrolls sideways instead of running off the card. */}
      <div className="flex flex-col gap-2 px-4 pb-2 sm:px-6 [&>*]:max-w-full [&>*]:overflow-x-auto [&>*]:[scrollbar-width:none] [&>*>*]:shrink-0">
        <CodebaseSectionTabs workspaceSlug={workspaceSlug} projectId={projectId} />
        <Suspense fallback={<div className="h-9 w-full max-w-md animate-pulse rounded-lg bg-muted/40" />}>
          <CodebaseTabs />
        </Suspense>
      </div>
    </header>
  );
}

/** The attached view tabs — route-synchronized via `useCodebaseWorkspace` (`?view=`),
 * so they stay in lockstep with the page content that reads the same param. */
function CodebaseTabs() {
  const ws = useCodebaseWorkspace();
  return <CodebaseViewTabs view={ws.view} onChange={ws.setView} />;
}

const INDEX_META: Record<
  EIndexStatus,
  { dot: string; label: (indexedAt: string | null) => string }
> = {
  [EIndexStatus.Ready]: {
    dot: "bg-emerald-500",
    label: (at) => (at ? `Indexed ${relativeTime(at)}` : "Indexed"),
  },
  [EIndexStatus.Indexing]: { dot: "bg-sky-500 animate-pulse", label: () => "Indexing…" },
  [EIndexStatus.Pending]: { dot: "bg-sky-500 animate-pulse", label: () => "Queued to index" },
  [EIndexStatus.Failed]: { dot: "bg-red-500", label: () => "Index failed" },
  [EIndexStatus.None]: { dot: "bg-muted-foreground/40", label: () => "Not indexed" },
};

function RepoMeta({
  repo,
  branch,
  status,
  indexedAt,
}: {
  repo: string | null;
  branch: string | null;
  status: EIndexStatus | undefined;
  indexedAt: string | null;
}) {
  // Undefined = the project is still loading — skeleton, never a fabricated value.
  if (status === undefined) {
    return <span className="hidden h-4 w-40 animate-pulse rounded bg-muted lg:block" aria-hidden />;
  }
  const meta = INDEX_META[status];
  return (
    <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground lg:flex">
      {repo ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono">
          <HugeiconsIcon icon={SourceCodeIcon} className="size-3.5 shrink-0" />
          <span className="truncate">{repo}</span>
          {branch ? (
            <>
              <span className="text-muted-foreground/50">/</span>
              <span className="truncate">{branch}</span>
            </>
          ) : null}
        </span>
      ) : null}
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden />
        {meta.label(indexedAt)}
      </span>
      {status === EIndexStatus.Ready ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-foreground">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 text-emerald-500" />
          Synced
        </span>
      ) : null}
    </div>
  );
}
