"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Infinity01Icon } from "@hugeicons/core-free-icons";

import { AgentAvatar } from "@/components/ui/agent-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BMAD_AGENTS } from "@/constants/bmad-agents";
import { cn } from "@/lib/utils";

export function AgentPicker({
  selectedAgentId,
  onSelect,
  className,
}: {
  selectedAgentId: string | null;
  onSelect: (agentId: string | null) => void;
  className?: string;
}) {
  const selected = BMAD_AGENTS.find((a) => a.id === selectedAgentId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 max-w-[140px] items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 text-xs font-medium text-foreground transition-transform duration-150 ease-out hover:bg-muted active:scale-[0.97]",
            className,
          )}
        >
          {selected ? (
            <>
              <AgentAvatar
                role={selected.name}
                persona={selected.persona}
                display_name={`${selected.name} · ${selected.persona}`}
                size="xs"
                pop={false}
              />
              <span className="truncate">{selected.name}</span>
            </>
          ) : (
            <>
              <HugeiconsIcon icon={Infinity01Icon} className="size-3.5 text-muted-foreground" />
              <span>Agent</span>
            </>
          )}
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={() => onSelect(null)}>No agent</DropdownMenuItem>
        {BMAD_AGENTS.map((agent) => (
          <DropdownMenuItem key={agent.id} onSelect={() => onSelect(agent.id)}>
            <AgentAvatar
              role={agent.name}
              persona={agent.persona}
              display_name={`${agent.name} · ${agent.persona}`}
              size="xs"
              pop={false}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{agent.name}</p>
              <p className="truncate text-xs text-muted-foreground">{agent.phase}</p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
