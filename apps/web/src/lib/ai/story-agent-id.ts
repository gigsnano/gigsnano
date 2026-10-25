import { BMAD_AGENTS } from "@/constants/bmad-agents";
import { parseBmadAgent } from "@/lib/issues/assignee-avatars";
import type { IStory } from "@/types";

/** BMAD agent roster id for slash-command filtering in story chat. */
export function resolveStoryAgentId(story: IStory, mode?: "break-down"): string | null {
  if (mode === "break-down") return "agent_pm";
  if (story.ai_agent_id) return story.ai_agent_id;
  if (story.bmad?.agent) {
    const { role } = parseBmadAgent(story.bmad.agent);
    return BMAD_AGENTS.find((a) => a.name === role)?.id ?? null;
  }
  return null;
}
