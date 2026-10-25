"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentConnections } from "@/hooks/ai/use-agent-connections";
import { useCreateDelegation } from "@/hooks/ai/use-delegations";
import { canDelegate } from "@/lib/ai/delegation-status";
import { PROVIDER_LABEL } from "@/mocks/data/agent-delegation";
import { EAgentConnectionStatus, EDelegationUnit } from "@/types/ai/agent-delegation";
import { cn } from "@/lib/utils";

import { DelegationStatusCard } from "./delegation-status-card";

export function RunWithAgentButton({
  workspaceSlug,
  projectId,
  storyId,
  unitType,
  hasRepo,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  unitType: EDelegationUnit;
  hasRepo: boolean;
}) {
  const { data: connections } = useAgentConnections();
  const create = useCreateDelegation(workspaceSlug, projectId, storyId);
  const [delegationId, setDelegationId] = useState<string | null>(null);

  const usable = (connections ?? []).filter(
    (c) => canDelegate({ connectionStatus: c.status, unitType, hasRepo }).ok,
  );

  const dispatch = (connectionId: string) => {
    create.mutate(
      { unit_type: unitType, unit_id: storyId, connection_id: connectionId },
      { onSuccess: (d) => setDelegationId(d.id) },
    );
  };

  if (delegationId) {
    return (
      <DelegationStatusCard
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        delegationId={delegationId}
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-xs transition-transform duration-150 ease-out active:scale-[0.97]",
            create.isPending && "t-shimmer",
          )}
          disabled={create.isPending}
        >
          {create.isPending ? "Delegating…" : "Run with agent ▾"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {usable.length === 0 ? (
          <DropdownMenuItem disabled>
            {(connections ?? []).some((c) => c.status === EAgentConnectionStatus.Connected)
              ? unitType === EDelegationUnit.WorkItem && !hasRepo
                ? "Connect a repo to this project"
                : "No usable agent"
              : "Connect an agent in account settings"}
          </DropdownMenuItem>
        ) : (
          usable.map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => dispatch(c.id)}>
              {PROVIDER_LABEL[c.provider]} — {c.account_label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
