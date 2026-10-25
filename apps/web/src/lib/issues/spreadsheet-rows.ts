import type { IStory } from "@/types";
import type { ISortLevel } from "@/store/ui/issues-view.store";
import { sortStories, type ISortCtx } from "./story-sort";

/**
 * Rows for the spreadsheet layout.
 *
 * No longer filters to roots: which items exist is decided once, in
 * `buildIssueTree`, so the spreadsheet, the list and the board can't disagree on
 * how many rows a filter matched. All this does now is order them.
 */
export function spreadsheetRows(
  stories: IStory[],
  sort: readonly ISortLevel[],
  ctx: ISortCtx,
): IStory[] {
  return sortStories(stories, sort, ctx);
}
