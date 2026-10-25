import type { IStory } from "@/types";
import type { EIssueLayout } from "@/store/ui/issues-view.store";
import type { IStoryGroup } from "./issues-grouping";
import { sortStories, type ISortCtx, type ISortLevel } from "./story-sort";

/** How a layout arranges the matching items. */
export type TTreeMode = "nested" | "flat";

export interface IIssueTree {
  /** Top-level rows the layout renders. */
  rows: IStory[];
  /**
   * Matching children keyed by parent id. Empty in flat mode.
   *
   * This map is the fix: the old `populationFor` filtered children OUT of the
   * array and the List then asked that same array for them, so the chevron was
   * drawn from `sub_issue_count` (an unfiltered API counter) while the click
   * read an array the children had been removed from. Now the predicate and the
   * payload are one lookup, and a parent with nothing matching is simply absent.
   */
  childrenById: Map<string, IStory[]>;
  /** Every matching item, row or nested — what the count badge reports. */
  all: IStory[];
}

/**
 * Arrange the filtered stories. Called once, in `useIssuesData`, so no two
 * layouts can disagree about what matched.
 *
 * An orphan — a child whose parent the current filter excluded — becomes a row.
 * Hiding it would mean a filtered view silently dropping work that matched.
 */
export function buildIssueTree(stories: IStory[], mode: TTreeMode): IIssueTree {
  if (mode === "flat") {
    return { rows: stories, childrenById: new Map(), all: stories };
  }

  const present = new Set(stories.map((s) => s.id));
  const rows: IStory[] = [];
  const childrenById = new Map<string, IStory[]>();

  for (const story of stories) {
    const parentId = story.parent_id;
    if (parentId !== null && present.has(parentId)) {
      const siblings = childrenById.get(parentId);
      if (siblings) siblings.push(story);
      else childrenById.set(parentId, [story]);
    } else {
      rows.push(story);
    }
  }

  return { rows, childrenById, all: stories };
}

/** Layouts whose vertical position is already owned by another axis — a status
 *  column, a calendar day — so a child cannot also sit under its parent. */
const ALWAYS_FLAT: ReadonlySet<EIssueLayout> = new Set<EIssueLayout>([
  "kanban",
  "calendar",
  "graph",
]);

/**
 * The arrangement for a layout. `showSubIssuesAsRows` is the stored toggle
 * (`true` = flat), passed through unchanged so there is no inversion to get
 * wrong at the call site.
 */
export function treeModeFor(
  layout: EIssueLayout,
  showSubIssuesAsRows: boolean,
): TTreeMode {
  if (ALWAYS_FLAT.has(layout)) return "flat";
  return showSubIssuesAsRows ? "flat" : "nested";
}

/** Flat list of visible row ids (respects expand state) for shift+click range select. */
export function visibleListRowIds(
  groups: IStoryGroup[],
  childrenById: Map<string, IStory[]>,
  expandedIssueIds: string[],
  sort: readonly ISortLevel[],
  ctx?: ISortCtx,
): string[] {
  const ids: string[] = [];
  const walk = (story: IStory) => {
    ids.push(story.id);
    if (!expandedIssueIds.includes(story.id)) return;
    for (const child of sortStories(childrenById.get(story.id) ?? [], sort, ctx)) walk(child);
  };
  for (const group of groups) for (const story of group.stories) walk(story);
  return ids;
}

/** Full tree walk for prev/next — includes every sub-item regardless of expand state. */
export function allNavigationRowIds(
  groups: IStoryGroup[],
  childrenById: Map<string, IStory[]>,
  sort: readonly ISortLevel[],
  ctx?: ISortCtx,
): string[] {
  const ids: string[] = [];
  const walk = (story: IStory) => {
    ids.push(story.id);
    for (const child of sortStories(childrenById.get(story.id) ?? [], sort, ctx)) walk(child);
  };
  for (const group of groups) for (const story of group.stories) walk(story);
  return ids;
}
