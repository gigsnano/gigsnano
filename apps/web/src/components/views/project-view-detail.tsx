"use client";

import { useEffect } from "react";
import Link from "next/link";

import { KanbanBoard } from "@/components/board";
import { EmptyState } from "@/components/empty-state";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { MobileHeader } from "@/components/layout/mobile-header";
import { FeatureDisabledGuard } from "@/components/projects/feature-disabled-guard";
import { useAuthUser } from "@/hooks/auth/use-auth";
import {
  useCycleStories,
  useModuleStories,
  useProjectStoriesPage,
} from "@/hooks/story/use-stories";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { useProjectViews } from "@/hooks/project/use-views";
import { storyWorkHref } from "@/lib/issues/issue-routes";
import { filterStories } from "@/lib/issues/issues-grouping";
import { gigsqlToFilters } from "@/lib/views/gigsql-codec";
import { gigsqlViewError } from "@/lib/views/validate-gigsql";
import {
  EMPTY_ISSUE_FILTERS,
  type IIssueFilters,
  useIssuesViewStore,
} from "@/store/ui/issues-view.store";
import { EStoryStatus, EViewLayout, type IStory } from "@/types";

/** Single-scope id for the dedicated cycle/module endpoints (skip client paging). */
function singleScope(filters: IIssueFilters | null, key: "cycle" | "module"): string | undefined {
  return filters && filters[key].length === 1 ? filters[key][0] : undefined;
}

const STATUS_LABEL: Record<EStoryStatus, string> = {
  [EStoryStatus.Todo]: "To do",
  [EStoryStatus.InProgress]: "In progress",
  [EStoryStatus.InReview]: "In review",
  [EStoryStatus.Done]: "Done",
};

export function ProjectViewDetail({
  workspaceSlug,
  projectId,
  viewId,
}: {
  workspaceSlug: string;
  projectId: string;
  viewId: string;
}) {
  return (
    <FeatureDisabledGuard workspaceSlug={workspaceSlug} projectId={projectId} feature="views">
      <ProjectViewDetailContent workspaceSlug={workspaceSlug} projectId={projectId} viewId={viewId} />
    </FeatureDisabledGuard>
  );
}

function ProjectViewDetailContent({
  workspaceSlug,
  projectId,
  viewId,
}: {
  workspaceSlug: string;
  projectId: string;
  viewId: string;
}) {
  const { data: user } = useAuthUser();
  const views = useProjectViews(workspaceSlug, projectId);
  const view = views.data?.find((v) => v.id === viewId);
  const setFilters = useIssuesViewStore((s) => s.setFilters);

  // Saved views speak full GigsQL (GIN-311) — resolve them the same way the
  // toolbar does. `me` → the current user so client + server assignee narrowing
  // agree. `null` = a query too complex to represent client-side.
  const rawFilters = gigsqlToFilters(view?.filter_query ?? "");
  const filters: IIssueFilters | null =
    rawFilters && user
      ? { ...rawFilters, assignee: rawFilters.assignee.map((a) => (a === "me" ? user.id : a)) }
      : rawFilters;

  // Sync saved filters into the shared issues filter store (GIN-171).
  useEffect(() => {
    if (!view) return;
    setFilters(gigsqlToFilters(view.filter_query) ?? EMPTY_ISSUE_FILTERS);
  }, [view, setFilters]);
  const cycleId = singleScope(filters, "cycle");
  const moduleId = singleScope(filters, "module");
  const unscoped = !cycleId && !moduleId;

  const { setOffset, pageFilters } = useOffsetPagination(50);
  const pageQuery = useProjectStoriesPage(
    workspaceSlug,
    projectId,
    {
      product_only: true,
      // Narrow server-side where we can; filterStories still runs so the two agree.
      assignee_id:
        filters && filters.assignee.length === 1 && filters.assignee[0] !== "unassigned"
          ? filters.assignee[0]
          : undefined,
      ...pageFilters,
    },
    unscoped,
  );
  const cycleStories = useCycleStories(workspaceSlug, projectId, cycleId ?? "", Boolean(cycleId));
  const moduleStories = useModuleStories(
    workspaceSlug,
    projectId,
    moduleId ?? "",
    Boolean(moduleId),
  );

  const rawStories = cycleId
    ? cycleStories.data
    : moduleId
      ? moduleStories.data
      : pageQuery.data?.items;

  const isPending = cycleId
    ? cycleStories.isPending
    : moduleId
      ? moduleStories.isPending
      : pageQuery.isPending;

  const isError = cycleId
    ? cycleStories.isError
    : moduleId
      ? moduleStories.isError
      : pageQuery.isError;

  const refetch = cycleId
    ? cycleStories.refetch
    : moduleId
      ? moduleStories.refetch
      : pageQuery.refetch;

  // Unrepresentable queries (cross-field OR, etc.) → show nothing rather than an
  // unfiltered page (GIN-175: never present a filter we couldn't honour as "all").
  const stories = filters ? filterStories(rawStories ?? [], filters) : [];

  if (views.isPending) {
    return <div className="m-6 h-32 animate-pulse rounded-lg border bg-muted" />;
  }

  if (!view) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="View not found"
          description="This saved view doesn't exist or was deleted."
          actions={[
            { label: "Back to views", href: `/${workspaceSlug}/projects/${projectId}/views` },
          ]}
        />
      </div>
    );
  }

  // The GIN-175 fix. A filter we can't honour is reported, never rendered as an
  // unfiltered list — the user cannot otherwise tell the two apart. `filters` is
  // null when the saved query is invalid or too complex to render client-side.
  if (filters === null) {
    const reason =
      gigsqlViewError(view.filter_query) ??
      "This view's filter is too complex to display here.";
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="This view's filter isn't supported"
          description={`${reason} Nothing is shown rather than every work item, because an unfiltered list here would look like a filtered one. Edit the view to fix its filter.`}
          actions={[
            { label: "Back to views", href: `/${workspaceSlug}/projects/${projectId}/views` },
          ]}
        />
        <p className="mt-4 text-center font-mono text-xs text-muted-foreground">
          {view.filter_query}
        </p>
      </div>
    );
  }

  if (view.layout === EViewLayout.Board) {
    const interactive =
      Boolean(cycleId) ||
      Boolean(moduleId) ||
      Boolean(user && filters?.assignee.includes(user.id));
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b px-6 py-4">
          <h2 className="text-base font-semibold">{view.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{view.description}</p>
        </div>
        <div className="min-h-0 flex-1">
          <KanbanBoard
            stories={stories ?? []}
            isPending={isPending}
            isError={isError}
            refetch={refetch}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
            enableAgentChat={interactive}
            enableDragDrop={interactive}
            showAssigneeFilter
            emptyTitle="No stories match this view"
            emptyDescription="Adjust the view filter or add stories to the project."
          />
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load view"
          description="Something went wrong. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const items = stories ?? [];

  if (view.layout === EViewLayout.List) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-base font-semibold">{view.name}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{view.description}</p>
        </div>
        {!items.length ? (
          <EmptyState assetKey="board" title="No stories" description="Nothing matches this view filter." />
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {items.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{STATUS_LABEL[s.status]}</p>
                  </div>
                  <Link
                    href={storyWorkHref(workspaceSlug, s)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
            {unscoped && pageQuery.data && pageQuery.data.total > pageQuery.data.limit ? (
              <OffsetPagination
                offset={pageQuery.data.offset}
                limit={pageQuery.data.limit}
                total={pageQuery.data.total}
                onOffsetChange={setOffset}
              />
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h2 className="text-base font-semibold">{view.name}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{view.description}</p>
      </div>
      {!items.length ? (
        <EmptyState assetKey="board" title="No stories" description="Nothing matches this view filter." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Sprint</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2 font-medium">{s.title}</td>
                    <td className="px-4 py-2 text-muted-foreground">{STATUS_LABEL[s.status]}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={storyWorkHref(workspaceSlug, s)}
                        className="text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unscoped && pageQuery.data && pageQuery.data.total > pageQuery.data.limit ? (
            <OffsetPagination
              offset={pageQuery.data.offset}
              limit={pageQuery.data.limit}
              total={pageQuery.data.total}
              onOffsetChange={setOffset}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
