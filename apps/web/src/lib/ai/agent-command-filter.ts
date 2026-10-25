import type { IAgentCommand } from "@/constants/agent-commands";

export function filterAgentCommands(
  commands: IAgentCommand[],
  opts: { agentId?: string | null; query?: string },
): IAgentCommand[] {
  const q = (opts.query ?? "").replace(/^\//, "").trim().toLowerCase();
  return commands.filter((c) => {
    if (opts.agentId && !c.agent_ids.includes(opts.agentId)) return false;
    if (!q) return true;
    const hay = `${c.slash} ${c.label} ${c.description}`.toLowerCase();
    return hay.includes(q);
  });
}
