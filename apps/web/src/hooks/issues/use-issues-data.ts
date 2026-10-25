"use client";

import { useEffect } from "react";

import { useProject } from "@/hooks/project/use-projects";
import {
  useCycleStories,
  useProjectStories,
  useProjectStoriesPage,
} from "@/hooks/story/use-stories";
import { useMembers } from "@/hooks/workspace/use-members";
import { useProjectLabels } from "@/hooks/project/use-project-settings";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { ISSUES_PAGE_SIZE } from "@/services/story/story.service";
import { buildAssigneeMap, type IAssigneePreview } from "@/lib/issues/story-assignees";
import { filterStories } from "@/lib/issues/issues-grouping";
import { buildIssueTree, treeModeFor, type IIssueTree, type TTreeMode } from "@/lib/issues/issue-tree";
import { agentAvatarFromStory, type TAgentAvatar } from "@/lib/issues/assignee-avatars";
import type { ISortCtx } from "@/lib/issues/story-sort";
import {
  isBoundedIssuesScope,
  isFullFetchLayout,
  toStoryApiFilters,
} from "@/lib/issues/to-story-api-filters";
import { useIssuesViewStore, countActiveFilters } from "@/store/ui/issues-view.store";
import type { IProject, IProjectLabel, IStory } from "@/types";

export interface IIssuesPagination {
  offset: number;
  limit: number;
  total: number;
  setOffset: (offset: number) => void;
}

export interface IIssuesData {
  project: IProject | undefined;
  /** Stories after scope + filter pass (paginated slice when unscoped). */
  stories: IStory[];
  /** The arrangement for the active layout — rows, nested children, and the full match set. */
  tree: IIssueTree;
  /** Whether the active layout nests. Gantt reads this to decide its own tree. */
  treeMode: TTreeMode;
  /** Backend total when filters/gigsql are active; null when unfiltered. */
  filteredTotal: number | null;
  assignees: Map<string, IAssigneePreview>;
  /**
   * Context for `sortStories`, built once here.
   *
   * Only the `assignee` key needs it — sorting people by their id is sorting by
   * a random string. It lives on the data rather than being rebuilt per call
   * site because it was: the spreadsheet made its own lambda in two places, the
   * list and the navigation seam made none, so the same sort produced different
   * orders in different parts of one screen.
   */
  sortCtx: ISortCtx;
  agents: Map<string, TAgentAvatar>;
  labels: Map<string, IProjectLabel>;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  /** Present when loading the full project backlog (no sprint/cycle scope). */
  pagination: IIssuesPagination | null;
}

/** Shared data for every Work Item view: project + filtered stories + resolvers. */
export function useIssuesData(
  workspaceSlug: string,
  projectId: string,
  cycleId?: string,
): IIssuesData {
  const { data: project } = useProject(workspaceSlug, projectId);
  const filters = useIssuesViewStore((s) => s.filters);
  const gigsqlQuery = useIssuesViewStore((s) => s.gigsqlQuery);
  const layout = useIssuesViewStore((s) => s.layout);
  const sort = useIssuesViewStore((s) => s.sort);
  const showSubIssues = useIssuesViewStore((s) => s.showSubIssues);
  const calendarMonthKey = useIssuesViewStore((s) => s.calendarMonthKey);

  const bounded = isBoundedIssuesScope(cycleId);
  // List/Kanban/Spreadsheet group + sort client-side, and Gantt virtualises its
  // rows (GIN-119), so all four need the COMPLETE story set (like a cycle scope).
  // Only Calendar stays paginated — it scopes to the visible month server-side.
  const fullFetch = isFullFetchLayout(layout);
  const useFull = !bounded && fullFetch; // full project fetch (all pages)
  const usePage = !bounded && !fullFetch; // server-paginated (calendar only)
  const { offset, setOffset, reset: resetPagination, pageFilters } = useOffsetPagination(
    ISSUES_PAGE_SIZE,
  );

  useEffect(() => {
    resetPagination();
  }, [filters, gigsqlQuery, layout, sort, calendarMonthKey, cycleId, resetPagination]);

  const apiFilters = toStoryApiFilters({
    cycleId,
    layout,
    sort,
    filters,
    gigsqlQuery,
    calendarMonthKey,
    limit: pageFilters.limit,
    offset: pageFilters.offset,
  });

  const hasActiveFilters =
    countActiveFilters(filters) > 0 || Boolean(gigsqlQuery.trim());
  const countFilters = toStoryApiFilters({
    cycleId,
    layout,
    sort,
    filters,
    gigsqlQuery,
    limit: 1,
    offset: 0,
  });
  const countQuery = useProjectStoriesPage(
    workspaceSlug,
    projectId,
    countFilters,
    hasActiveFilters && !bounded,
  );

  const cycleQuery = useCycleStories(workspaceSlug, projectId, cycleId ?? "", bounded);
  const fullQuery = useProjectStories(workspaceSlug, projectId, useFull);
  const pageQuery = useProjectStoriesPage(workspaceSlug, projectId, apiFilters, usePage);

  const { data: members } = useMembers(workspaceSlug);
  const { data: labelList } = useProjectLabels(workspaceSlug, projectId);

  // Client-fetched sets (cycle scope, full project) are filtered in memory; the paged
  // server query already applied the filters via apiFilters.
  // List/Kanban/Spreadsheet/Gantt → full fetch. Calendar → server page (scoped to
  // the visible month).
  const rawStories = bounded
    ? (cycleQuery.data ?? [])
    : fullFetch
      ? (fullQuery.data ?? [])
      : (pageQuery.data?.items ?? []);
  const filtered = usePage ? rawStories : filterStories(rawStories, filters);
  // The one place the sub-item rule is applied. Every layout renders what comes
  // out of here, which is what makes their counts agree.
  const treeMode = treeModeFor(layout, showSubIssues);
  const tree = buildIssueTree(filtered, treeMode);
  const stories = tree.rows;

  const assignees = buildAssigneeMap(members ?? []);
  // One construction, shared by every consumer that orders rows for display.
  const sortCtx: ISortCtx = {
    assigneeName: (id) => assignees.get(id)?.display_name ?? null,
  };
  const agents = (() => {
    const map = new Map<string, TAgentAvatar>();
    for (const s of stories) {
      const agent = agentAvatarFromStory(s);
      if (agent && !map.has(agent.id)) map.set(agent.id, agent);
    }
    return map;
  })();
  const labels = new Map((labelList ?? []).map((l) => [l.id, l]));

  const activeQuery = bounded ? cycleQuery : fullFetch ? fullQuery : pageQuery;
  const isPending = activeQuery.isPending;
  const isError = activeQuery.isError;
  const refetch = () => {
    void activeQuery.refetch();
  };

  // Pagination UI only applies to the server-paginated (calendar) path — null here
  // is what hides the footer for every other layout.
  const pagination: IIssuesPagination | null = usePage
    ? {
        offset: pageQuery.data?.offset ?? offset,
        limit: pageQuery.data?.limit ?? ISSUES_PAGE_SIZE,
        total: pageQuery.data?.total ?? 0,
        setOffset,
      }
    : null;

  return {
    project,
    stories,
    tree,
    treeMode,
    filteredTotal: hasActiveFilters ? (countQuery.data?.total ?? null) : null,
    assignees,
    sortCtx,
    agents,
    labels,
    isPending,
    isError,
    refetch,
    pagination,
  };
}
