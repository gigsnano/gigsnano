import { EStoryRelationType, EStoryStatus, type IStory } from "@/types";
import type { IStoryRelation } from "@/types/story/story-detail";

/**
 * Counts behind the Overview "Relationships" row (GIN-480).
 *
 * `Sub-items 2/3 · Blocking 1 · Blocked by 0 · Related 2 · Links 1` replaces a
 * stack of sections that each rendered a heading whether or not it had anything
 * in it. Pure so the display can be trusted without mounting the widget.
 */
export interface IRelationshipSummary {
  subItems: { done: number; total: number };
  blocking: number;
  blockedBy: number;
  related: number;
  duplicates: number;
  links: number;
  /** Nothing to relate — the row renders as a single Add action instead. */
  isEmpty: boolean;
  /** A non-zero blocker is the only value that earns warning colour. */
  hasBlockers: boolean;
}

export function relationshipSummary({
  story,
  projectStories,
  relations,
  linkCount,
}: {
  story: IStory;
  /** The project's stories — sub-items are read from here, so no extra request. */
  projectStories: IStory[] | undefined;
  relations: IStoryRelation[] | undefined;
  linkCount: number;
}): IRelationshipSummary {
  const children = (projectStories ?? []).filter((s) => s.parent_id === story.id);
  // `sub_issue_count` is the API's own tally; prefer it over what happens to be
  // loaded, and fall back to the loaded children when it is absent.
  const total = story.sub_issue_count || children.length;
  const done = children.filter((s) => s.status === EStoryStatus.Done).length;

  const by = (type: EStoryRelationType) =>
    (relations ?? []).filter((r) => r.relation_type === type).length;

  const blocking = by(EStoryRelationType.Blocks);
  const blockedBy = by(EStoryRelationType.BlockedBy);
  const related = by(EStoryRelationType.RelatesTo);
  const duplicates = by(EStoryRelationType.Duplicate);

  return {
    subItems: { done, total },
    blocking,
    blockedBy,
    related,
    duplicates,
    links: linkCount,
    isEmpty:
      total === 0 && blocking === 0 && blockedBy === 0 && related === 0 && duplicates === 0 && linkCount === 0,
    hasBlockers: blockedBy > 0,
  };
}
