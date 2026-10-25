import { STORY_STATUS_ORDER } from "@/constants/story-meta";
import type { EIssueLayout, ISortLevel, TGroupBy } from "@/store/ui/issues-view.store";

import { groupStories } from "./issues-grouping";
import { allNavigationRowIds, type IIssueTree } from "./issue-tree";
import { sortStories, type ISortCtx } from "./story-sort";

export interface IIssueNavigationOpts {
  layout: EIssueLayout;
  groupBy: TGroupBy;
  sort: readonly ISortLevel[];
  expandedIssueIds: string[];
  showSubIssues: boolean;
  /** Same context the layouts sort with. Without it an assignee sort orders by
   *  raw id here and by display name on screen, so prev/next walks a different
   *  order than the one the reader sees. */
  ctx?: ISortCtx;
}

/**
 * Flat ids in the same order the active Work Items layout renders rows.
 *
 * `stories` is the view's population — sub-items are already in it, or already
 * out of it, per the display toggle. The one exception is below: with the
 * toggle off, prev/next still walks into hidden children so a sub-item opened
 * from its parent is not a dead end.
 */
export function navigationIssueIds(tree: IIssueTree, opts: IIssueNavigationOpts): string[] {
  switch (opts.layout) {
    case "list": {
      const groups = groupStories(tree.rows, opts.groupBy, opts.sort, undefined, opts.ctx);
      if (opts.showSubIssues) {
        return groups.flatMap((g) => g.stories.map((s) => s.id));
      }
      return allNavigationRowIds(groups, tree.childrenById, opts.sort, opts.ctx);
    }
    case "spreadsheet": {
      // No grouping here — build one synthetic "all" group and walk it the same
      // way List does, so a nested child (the Spreadsheet nests too) gets a
      // navigation id instead of falling through to neither `ids` nor
      // `fallbackIds`.
      const group = { key: "all", stories: sortStories(tree.rows, opts.sort, opts.ctx) };
      return allNavigationRowIds([group], tree.childrenById, opts.sort, opts.ctx);
    }
    case "kanban": {
      // Always-flat layout: tree.all === tree.rows, so this is a no-op that
      // documents the same contract as calendar/gantt below.
      const ordered = sortStories(tree.all, opts.sort, opts.ctx);
      const ids: string[] = [];
      for (const status of STORY_STATUS_ORDER) {
        for (const story of ordered) {
          if (story.status === status) ids.push(story.id);
        }
      }
      return ids;
    }
    case "calendar":
    case "gantt":
      // dhtmlx builds its own tree from a flat array plus each task's `parent`,
      // so every item — parent or child — is a rendered row there; `tree.all`
      // (not `tree.rows`) is what actually reaches the chart. Calendar is
      // always flat, so `all === rows` there and this is a no-op that
      // documents the same intent.
      return sortStories(tree.all, opts.sort, opts.ctx)
        .slice()
        .sort((a, b) => {
          const da = a.target_date ?? "";
          const db = b.target_date ?? "";
          if (da !== db) return da.localeCompare(db);
          return a.order - b.order;
        })
        .map((s) => s.id);
    default:
      return sortStories(tree.rows, []).map((s) => s.id);
  }
}

export interface IIssueNavPosition {
  index: number;
  position: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
}

export function issueNavPosition(
  currentId: string,
  ids: string[],
  fallbackIds?: string[],
): IIssueNavPosition {
  let resolved = ids;
  let index = ids.indexOf(currentId);

  if (index === -1 && fallbackIds?.length) {
    index = fallbackIds.indexOf(currentId);
    if (index >= 0) resolved = fallbackIds;
  }

  if (index === -1) {
    return { index: -1, position: 0, total: resolved.length, prevId: null, nextId: null };
  }

  return {
    index,
    position: index + 1,
    total: resolved.length,
    prevId: index > 0 ? resolved[index - 1]! : null,
    nextId: index < resolved.length - 1 ? resolved[index + 1]! : null,
  };
}
