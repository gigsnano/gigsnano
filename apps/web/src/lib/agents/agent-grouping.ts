import type { IAgent } from "@/types/ai/agent";

export interface IAgentGroup {
  domain: string;
  agents: IAgent[];
}

/** Roster grouped by domain, filtered by a free-text query. Disabled agents are
 *  dropped — the contact list is who you can call, not who exists. */
export function groupAgentsByDomain(agents: IAgent[], query: string): IAgentGroup[] {
  const needle = query.trim().toLowerCase();
  const matches = agents.filter(
    (a) =>
      a.enabled &&
      (!needle ||
        a.name.toLowerCase().includes(needle) ||
        a.persona.toLowerCase().includes(needle)),
  );

  const byDomain = new Map<string, IAgent[]>();
  for (const a of matches) {
    const list = byDomain.get(a.domain);
    if (list) list.push(a);
    else byDomain.set(a.domain, [a]);
  }

  return [...byDomain.entries()]
    .map(([domain, list]) => ({
      domain,
      agents: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}
