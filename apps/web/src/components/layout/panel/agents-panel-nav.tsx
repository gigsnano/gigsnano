"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AiBrain01Icon } from "@hugeicons/core-free-icons";

import { useAgents } from "@/hooks/agents/use-agents";
import { PanelNavLink, PanelSection } from "./panel-nav";

export function AgentsPanelNav({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}/agents`;
  const { data: agents } = useAgents(workspaceSlug);

  return (
    <div className="flex flex-1 flex-col gap-0.5 px-3 pb-3">
      <div className="pt-2">
        <PanelNavLink href={base} label="All agents" icon={AiBrain01Icon} active={pathname === base} />
      </div>
      <PanelSection title="Agents">
        {agents?.map((agent) => (
          <Link
            key={agent.id}
            href={`/${workspaceSlug}/agents/${agent.id}`}
            className={
              pathname === `/${workspaceSlug}/agents/${agent.id}`
                ? "block truncate rounded-md bg-sidebar-accent px-2.5 py-1.5 text-sm font-medium text-sidebar-accent-foreground"
                : "block truncate rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            }
          >
            {agent.name}
          </Link>
        ))}
      </PanelSection>
    </div>
  );
}
