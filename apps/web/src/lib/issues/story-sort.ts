import { PRIORITY_WEIGHT, STORY_STATUS_ORDER, STORY_TYPE_ORDER } from "@/constants/story-meta";
import type { IStory } from "@/types";

import { storyTypeOf } from "./story-type";

/**
 * Stacked work-item sorting.
 *
 * Replaces the four-value `orderBy`, which had its directions hardcoded and no
 * way to say "due date, soonest first". A sort is now a short ordered list of
 * levels, each with its own direction — the model Jira reaches through
 * `ORDER BY a ASC, b DESC` and Asana through its sort panel.
 */

export type TSortKey =
  | "priority"
  | "due"
  | "start"
  | "created"
  | "updated"
  | "title"
  | "assignee"
  | "status"
  | "type"
  | "estimate"
  | "subItems";

export interface ISortLevel {
  key: TSortKey;
  dir: "asc" | "desc";
}

/**
 * What the comparator can't read off a story by itself.
 *
 * Only assignee needs it: sorting people by their id is sorting by a random
 * string. Optional, so pure callers (grouping, tests) stay one argument long
 * and fall back to the id rather than crashing.
 */
export interface ISortCtx {
  assigneeName?: (assigneeId: string) => string | null;
}

/** Three is what fits the panel and what anyone can still reason about after. */
export const MAX_SORT_LEVELS = 3;

export const SORT_KEY_LABELS: Record<TSortKey, string> = {
  priority: "Priority",
  due: "Due date",
  start: "Start date",
  created: "Created",
  updated: "Updated",
  title: "Title",
  assignee: "Assignee",
  status: "Status",
  type: "Type",
  estimate: "Estimate",
  subItems: "Sub-items",
};

/** Every key, in the order the picker offers them. */
export const SORT_KEYS = Object.keys(SORT_KEY_LABELS) as TSortKey[];

/**
 * These read most-useful-first when descending: the urgent work, the newest
 * change. Everything else (dates, titles, names) reads naturally ascending.
 */
export const DESC_BY_DEFAULT: TSortKey[] = ["priority", "created", "updated"];

/**
 * A story's value on one key, or null when it has none.
 *
 * The null is the point of the union: "no due date" is not an early due date,
 * and every direction has to agree about that.
 */
function valueOf(story: IStory, key: TSortKey, ctx: ISortCtx): string | number | null {
  switch (key) {
    case "priority":
      return PRIORITY_WEIGHT[story.priority] ?? null;
    case "due":
      return story.target_date ?? null;
    case "start":
      return story.start_date ?? null;
    case "created":
      return story.created_at;
    case "updated":
      return story.updated_at;
    case "title":
      return story.title.toLowerCase();
    case "assignee":
      // By name when the caller can resolve one — sorting people by id is
      // sorting by a random string.
      if (!story.assignee_id) return null;
      return (ctx.assigneeName?.(story.assignee_id) ?? story.assignee_id).toLowerCase();
    case "status":
      return STORY_STATUS_ORDER.indexOf(story.status);
    case "type":
      return STORY_TYPE_ORDER.indexOf(storyTypeOf(story));
    case "estimate":
      return story.estimate_points ?? null;
    case "subItems":
      return story.sub_issue_count;
  }
}

function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: "asc" | "desc",
): number {
  // Missing values sink to the bottom whichever way the arrow points. Flipping
  // a direction must never promote "unset" to the top of the list.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (a === b) return 0;
  const ascending = a < b ? -1 : 1;
  return dir === "asc" ? ascending : -ascending;
}

/**
 * Order stories by each level in turn.
 *
 * An empty list means Manual: the stored `order` is the arrangement the user
 * dragged into place, and nothing else should decide the sequence. `Array#sort`
 * is stable everywhere we run, so rows no level separates keep their input
 * order rather than shuffling on every render.
 */
export function sortStories(
  stories: IStory[],
  sort: readonly ISortLevel[],
  ctx: ISortCtx = {},
): IStory[] {
  const list = [...stories];
  if (!sort.length) return list.sort((a, b) => a.order - b.order);
  return list.sort((a, b) => {
    for (const level of sort) {
      const result = compareValues(
        valueOf(a, level.key, ctx),
        valueOf(b, level.key, ctx),
        level.dir,
      );
      if (result !== 0) return result;
    }
    return 0;
  });
}
