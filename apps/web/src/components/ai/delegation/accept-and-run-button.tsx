"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentConnections } from "@/hooks/ai/use-agent-connections";
import { useLaunchStory } from "@/hooks/ai/use-delegations";
import { canDelegate } from "@/lib/ai/delegation-status";
import { APIError } from "@/services/api-error";
import { PROVIDER_LABEL } from "@/mocks/data/agent-delegation";
import { EAgentConnectionStatus, EDelegationUnit } from "@/types/ai/agent-delegation";
import { cn } from "@/lib/utils";

import { DelegationStatusCard } from "./delegation-status-card";

/** "Accept & run" (GIN-342): launch the work item to a connected agent, applying
 * the reviewed Execution Profile (pinned skills injected into the agent prompt).
 * Distinct from RunWithAgentButton — this is the profile-aware path, gated on the
 * profile being fresh (a stale profile is refused by the backend). */
export function AcceptAndRunButton({
  workspaceSlug,
  projectId,
  storyId,
  hasRepo,
  stale,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  hasRepo: boolean;
  stale: boolean;
}) {
  const { data: connections } = useAgentConnections();
  const launch = useLaunchStory(workspaceSlug, projectId, storyId);
  const [delegationId, setDelegationId] = useState<string | null>(null);

  const usable = (connections ?? []).filter(
    (c) => canDelegate({ connectionStatus: c.status, unitType: EDelegationUnit.WorkItem, hasRepo }).ok,
  );

  const run = (connectionId: string) =>
    launch.mutate(
      { connection_id: connectionId },
      { onSuccess: (res) => setDelegationId(res.delegation.id) },
    );

  if (delegationId) {
    return (
      <DelegationStatusCard
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        delegationId={delegationId}
      />
    );
  }

  const anyConnected = (connections ?? []).some(
    (c) => c.status === EAgentConnectionStatus.Connected,
  );
  const disabledReason = stale
    ? "Re-resolve the profile before running"
    : usable.length === 0
      ? anyConnected
        ? hasRepo
          ? "No usable agent"
          : "Connect a repo to this project"
        : "Connect an agent in account settings"
      : null;

  const trigger = (
    <Button
      size="sm"
      className={cn(
        "h-7 gap-1.5 text-xs transition-transform duration-150 ease-out active:scale-[0.97]",
        launch.isPending && "t-shimmer",
      )}
      disabled={launch.isPending || Boolean(disabledReason)}
    >
      <HugeiconsIcon icon={PlayIcon} size={13} />
      {launch.isPending ? "Launching…" : "Accept & run"}
    </Button>
  );

  return (
    <div className="space-y-1.5">
      {disabledReason ? (
        // A disabled trigger can't open a menu, so render the button + the reason inline.
        <div className="flex items-center gap-2">
          {trigger}
          <span className="text-[11px] text-muted-foreground">{disabledReason}</span>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {usable.map((c) => (
              <DropdownMenuItem key={c.id} onSelect={() => run(c.id)}>
                {PROVIDER_LABEL[c.provider]} — {c.account_label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {launch.error ? (
        <p className="text-[11px] text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          {launch.error instanceof APIError ? launch.error.message : "Couldn't launch — try again."}
        </p>
      ) : null}
    </div>
  );
}
