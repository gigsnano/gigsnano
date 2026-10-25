import type { IStory } from "@/types";
import { EStoryType } from "@/types";

/** Resolve a work item's type, defaulting to Story when the backend omits it. */
export function storyTypeOf(story: IStory): EStoryType {
  return story.type ?? EStoryType.Story;
}
