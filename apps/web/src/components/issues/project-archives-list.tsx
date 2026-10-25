"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useCycles } from "@/hooks/project/use-cycles";
import { useProjectStoriesPage } from "@/hooks/story/use-stories";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { ECycleStatus, EStoryStatus } from "@/types";

import { StoryListTable } from "./story-list-table";

export function ProjectArchivesList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { setOffset, pageFilters } = useOffsetPagination(30);
  const stories = useProjectStoriesPage(workspaceSlug, projectId, {
    status: EStoryStatus.Done,
    product_only: true,
    ...pageFilters,
  });
  const cycles = useCycles(workspaceSlug, projectId);

  const completedCycles = (cycles.data ?? []).filter((c) => c.status === ECycleStatus.Completed);

  if (stories.isPending || cycles.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <SkeletonReveal
          isLoading
          className="h-24"
          skeleton={<div className="size-full rounded-lg border bg-card" />}
        >
          <div />
        </SkeletonReveal>
      </div>
    );
  }

  if (stories.isError || cycles.isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load archives"
          description="Something went wrong fetching completed work."
          actions={[
            {
              label: "Retry",
              onClick: () => {
                stories.refetch();
                cycles.refetch();
              },
            },
          ]}
        />
      </div>
    );
  }

  const page = stories.data;

  return (
    <div className="flex flex-col gap-8 p-6">
      {completedCycles.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold">Completed cycles</h2>
          <ul className="mt-3 divide-y rounded-lg border bg-card">
            {completedCycles.map((cycle) => (
              <li key={cycle.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{cycle.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {cycle.completed_story_count}/{cycle.story_count} stories
                  </p>
                </div>
                <Link
                  href={`/${workspaceSlug}/projects/${projectId}/cycles/${cycle.id}`}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">Done stories</h2>
        <div className="-mx-6 mt-3">
          <StoryListTable
            stories={page?.items ?? []}
            workspaceSlug={workspaceSlug}
            isPending={false}
            isError={false}
            refetch={() => stories.refetch()}
            emptyTitle="No archived stories"
            emptyDescription="Completed stories will appear here once marked done on the board."
            pagination={
              page
                ? {
                    offset: page.offset,
                    limit: page.limit,
                    total: page.total,
                    onOffsetChange: setOffset,
                  }
                : undefined
            }
          />
        </div>
      </section>
    </div>
  );
}
