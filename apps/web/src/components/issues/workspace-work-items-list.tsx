"use client";

import { issueDetailHref } from "@/lib/issues/issue-routes";
import { useProjects } from "@/hooks/project/use-projects";
import { useWorkspaceStoriesPage } from "@/hooks/story/use-stories";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";

import { StoryListTable } from "./story-list-table";

export function WorkspaceWorkItemsList({ workspaceSlug }: { workspaceSlug: string }) {
  const { setOffset, pageFilters } = useOffsetPagination(30);
  const { data: page, isPending, isError, refetch } = useWorkspaceStoriesPage(workspaceSlug, {
    product_only: true,
    ...pageFilters,
  });
  const { data: projects } = useProjects(workspaceSlug);

  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));

  return (
    <StoryListTable
      stories={page?.items ?? []}
      workspaceSlug={workspaceSlug}
      isPending={isPending}
      isError={isError}
      refetch={refetch}
      resolveStoryHref={(story) => `${issueDetailHref(workspaceSlug, story)}?from=work-items`}
      projectNameForStory={(story) => projectNameById.get(story.project_id)}
      emptyTitle="No work items yet"
      emptyDescription="Product stories from all projects appear here. Create sprints and add delivery work to see issues across your workspace."
      emptyAction={{
        label: "Browse projects",
        href: `/${workspaceSlug}/projects`,
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
