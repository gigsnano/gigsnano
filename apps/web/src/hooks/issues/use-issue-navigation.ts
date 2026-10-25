"use client";

import { usePathname } from "next/navigation";

import { useIssuesData } from "@/hooks/issues/use-issues-data";
import { sortStories } from "@/lib/issues/story-sort";
import { issueNavPosition, navigationIssueIds } from "@/lib/issues/issue-navigation";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";

/** Prev/next context for a work item, mirroring the active list/kanban order. */
export function useIssueNavigation(
  workspaceSlug: string,
  projectId: string,
  storyId: string,
  cycleId?: string,
) {
  const pathname = usePathname();
  const data = useIssuesData(workspaceSlug, projectId, cycleId);

  const layout = useIssuesViewStore((s) => s.layout);
  const groupBy = useIssuesViewStore((s) => s.groupBy);
  const sort = useIssuesViewStore((s) => s.sort);
  const expandedIssueIds = useIssuesViewStore((s) => s.expandedIssueIds);
  const showSubIssues = useIssuesViewStore((s) => s.showSubIssues);

  const onIssuesRoute = pathname.includes(`/projects/${projectId}/issues`);
  const navLayout = onIssuesRoute ? layout : "kanban";

  const ids = navigationIssueIds(data.tree, {
    ctx: data.sortCtx,
    layout: navLayout,
    groupBy,
    sort,
    expandedIssueIds,
    showSubIssues,
  });

  const fallbackIds = sortStories(data.stories, sort, data.sortCtx).map((s) => s.id);
  const nav = issueNavPosition(storyId, ids, fallbackIds);

  return {
    ...nav,
    isLoading: data.isPending,
    hasNavigation: nav.total > 1 && nav.index >= 0,
    prevId: nav.prevId,
    nextId: nav.nextId,
  };
}

export type IIssueNavigation = ReturnType<typeof useIssueNavigation>;
