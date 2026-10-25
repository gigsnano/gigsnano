import { EStoryRelationType } from "@/types/story/story-detail";

export const RELATION_TYPE_LABEL: Record<EStoryRelationType, string> = {
  [EStoryRelationType.RelatesTo]: "Relates to",
  [EStoryRelationType.Blocks]: "Blocks",
  [EStoryRelationType.BlockedBy]: "Blocked by",
  [EStoryRelationType.Duplicate]: "Duplicate of",
};
