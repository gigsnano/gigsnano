import type { IStory } from "@/types";

/** Optimistic-cache helper: patches a single story's order (and any other fields) by id. */
export function applyReorder(
  stories: IStory[],
  storyId: string,
  patch: Partial<IStory> & { order: number },
): IStory[] {
  return stories.map((s) => (s.id === storyId ? { ...s, ...patch } : s));
}
