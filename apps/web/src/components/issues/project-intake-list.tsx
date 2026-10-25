"use client";

import { useProjectStoriesPage } from "@/hooks/story/use-stories";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { EStoryStatus } from "@/types";

import { StoryListTable } from "./story-list-table";

export function ProjectIntakeList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { setOffset, pageFilters } = useOffsetPagination(30);
  const { data: page, isPending, isError, refetch } = useProjectStoriesPage(
    workspaceSlug,
    projectId,
    {
      status: EStoryStatus.Todo,
      unassigned: true,
      product_only: true,
      ...pageFilters,
    },
  );

  return (
    <StoryListTable
      stories={page?.items ?? []}
      workspaceSlug={workspaceSlug}
      isPending={isPending}
      isError={isError}
      refetch={refetch}
      emptyTitle="Intake is empty"
      emptyDescription="Unassigned to-do stories appear here — triage them from the board or assign from the story panel."
      emptyAction={{
        label: "View board",
        href: `/${workspaceSlug}/projects/${projectId}/board`,
      }}
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
  );
}
