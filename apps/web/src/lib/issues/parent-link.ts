import type { IStory } from "@/types";

/**
 * Whether `sourceId` can be linked as a child of `targetId` (GIN-80: drag a work
 * item onto another to make it a child). Rejects the no-ops and the moves that
 * would corrupt the tree:
 *  - a story onto itself,
 *  - a BMAD planning story (those belong to the Sprint-0 board, not re-parenting),
 *  - a story that is already a direct child of the target,
 *  - a target that descends from the source (would create a cycle).
 */
export function canLinkAsChild(
  sourceId: string,
  targetId: string,
  stories: IStory[],
): boolean {
  if (sourceId === targetId) return false;

  const byId = new Map(stories.map((s) => [s.id, s]));
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) return false;
  if (source.bmad) return false;
  if (source.parent_id === targetId) return false;

  // Cycle guard: linking source under target makes target an ancestor of source,
  // which is invalid if source is already an ancestor of target.
  let walk: IStory | undefined = target;
  while (walk?.parent_id) {
    if (walk.parent_id === sourceId) return false;
    walk = byId.get(walk.parent_id);
  }
  return true;
}
