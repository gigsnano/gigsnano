import { BMAD_AGENTS } from "@/constants/bmad-agents";
import type { IMemberPreview, IStory } from "@/types";

export type THumanAvatar = {
  kind: "human";
  id: string;
  display_name: string;
  avatar_url: string | null;
};

export type TAgentAvatar = {
  kind: "agent";
  id: string;
  role: string;
  persona: string;
  /** "Role · Persona" (or just the role when there is no persona) — for tooltips. */
  display_name: string;
};

export type TAssigneeAvatar = THumanAvatar | TAgentAvatar;

/** Split a BMAD agent display string "Role · Persona" (middot separator). */
export function parseBmadAgent(agent: string): { role: string; persona: string } {
  const [rolePart, personaPart] = agent.split("·");
  return { role: (rolePart ?? "").trim(), persona: (personaPart ?? "").trim() };
}

function makeAgent(role: string, persona: string, id: string): TAgentAvatar {
  return { kind: "agent", id, role, persona, display_name: persona ? `${role} · ${persona}` : role };
}

/**
 * Agent-avatar descriptor for a story, or null when it has no agent:
 *  - BMAD card (story.bmad != null): parse story.bmad.agent (fixed; handles Paige).
 *  - Manual story (story.ai_agent_id != null): look up the BMAD_AGENTS roster.
 */
export function agentAvatarFromStory(story: IStory): TAgentAvatar | null {
  if (story.bmad) {
    const { role, persona } = parseBmadAgent(story.bmad.agent);
    if (!role && !persona) return null;
    return makeAgent(role, persona, `agent:${story.bmad.agent}`);
  }
  if (story.ai_agent_id) {
    const roster = BMAD_AGENTS.find((a) => a.id === story.ai_agent_id);
    if (!roster) return null;
    return makeAgent(roster.name, roster.persona, roster.id);
  }
  return null;
}

export function humanAvatar(m: IMemberPreview): THumanAvatar {
  return { kind: "human", id: m.id, display_name: m.display_name, avatar_url: m.avatar_url };
}
