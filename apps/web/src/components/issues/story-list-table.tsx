"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { peekHref, storyWorkHref } from "@/lib/issues/issue-routes";
import { stripHtmlToText } from "@/lib/format/strip-html";
import { EStoryStatus, type IStory } from "@/types";

const STATUS_LABEL: Record<EStoryStatus, string> = {
  [EStoryStatus.Todo]: "To do",
  [EStoryStatus.InProgress]: "In progress",
  [EStoryStatus.InReview]: "In review",
  [EStoryStatus.Done]: "Done",
};

/** Default row href when the caller doesn't provide `resolveStoryHref`: product stories open
 * the peek sheet (the callers that use this default — archives/intake — always sit under a
 * project layout that hosts `<IssuePeekSheet/>`); BMAD stories still deep-link to the board. */
function defaultStoryHref(workspaceSlug: string, story: IStory) {
  if (story.bmad) return storyWorkHref(workspaceSlug, story);
  return peekHref(story);
}

export function StoryListTable({
  stories,
  workspaceSlug,
  isPending,
  isError,
  refetch,
  emptyTitle,
  emptyDescription,
  emptyAction,
  resolveStoryHref,
  projectNameForStory,
  pagination,
}: {
  stories: IStory[];
  workspaceSlug: string;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: { label: string; href?: string; onClick?: () => void };
  resolveStoryHref?: (story: IStory) => string;
  projectNameForStory?: (story: IStory) => string | undefined;
  pagination?: {
    offset: number;
    limit: number;
    total: number;
    onOffsetChange: (offset: number) => void;
  };
}) {
  const hrefFor = (story: IStory) =>
    resolveStoryHref?.(story) ?? defaultStoryHref(workspaceSlug, story);

  const showProject = Boolean(projectNameForStory);

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonReveal
            key={i}
            isLoading
            className="h-12"
            skeleton={<div className="size-full rounded-lg border bg-card" />}
          >
            <div />
          </SkeletonReveal>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load stories"
          description="Something went wrong. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  if (stories.length === 0 && (pagination?.total ?? 0) === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="board"
          title={emptyTitle}
          description={emptyDescription}
          actions={emptyAction ? [emptyAction] : undefined}
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto p-6">
      <table className="w-full min-w-[32rem] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Title</th>
            {showProject ? <th className="pb-2 pr-4 font-medium">Project</th> : null}
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th scope="col" className="pb-2 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {stories.map((story) => {
            const href = hrefFor(story);
            const projectName = projectNameForStory?.(story);
            return (
              <tr key={story.id} className="group">
                <td className="py-3 pr-4">
                  <Link href={href} scroll={href.startsWith("?peek=") ? false : undefined} className="font-medium hover:text-primary">
                    {story.title}
                  </Link>
                  {story.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {stripHtmlToText(story.description)}
                    </p>
                  ) : null}
                </td>
                {showProject ? (
                  <td className="py-3 pr-4 text-muted-foreground">
                    {projectName ? (
                      <Link
                        href={`/${workspaceSlug}/projects/${story.project_id}`}
                        className="hover:text-primary"
                      >
                        {projectName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                ) : null}
                <td className="py-3 pr-4 text-muted-foreground">{STATUS_LABEL[story.status]}</td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {story.bmad ? "Sprint-0" : "Story"}
                </td>
                <td className="py-3 text-right">
                  <Link
                    href={href}
                    scroll={href.startsWith("?peek=") ? false : undefined}
                    className="text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pagination && pagination.total > pagination.limit ? (
        <div className="mt-4">
          <OffsetPagination
            offset={pagination.offset}
            limit={pagination.limit}
            total={pagination.total}
            onOffsetChange={pagination.onOffsetChange}
          />
        </div>
      ) : null}
    </div>
  );
}
