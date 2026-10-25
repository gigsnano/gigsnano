import type { IStory } from "@/types";

/** Work items that can be linked as a sub-item of `parentStory` (no cycles, no BMAD). */
export function subWorkLinkCandidates(stories: IStory[], parentStory: IStory): IStory[] {
  const parentId = parentStory.id;
  const byId = new Map(stories.map((s) => [s.id, s]));

  const isAncestorOfParent = (candidateId: string): boolean => {
    let walk: IStory | undefined = parentStory;
    while (walk?.parent_id) {
      if (walk.parent_id === candidateId) return true;
      walk = byId.get(walk.parent_id);
    }
    return false;
  };

  return stories.filter((s) => {
    if (s.bmad) return false;
    if (s.id === parentId) return false;
    if (s.parent_id === parentId) return false;
    if (isAncestorOfParent(s.id)) return false;
    return true;
  });
}
