"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Call02Icon } from "@hugeicons/core-free-icons";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgents } from "@/hooks/agents/use-agents";
import { groupAgentsByDomain } from "@/lib/agents/agent-grouping";
import type { IAgent } from "@/types";

import { AgentBuilderDialog } from "./agent-builder-dialog";

function ContactRow({ agent, workspaceSlug }: { agent: IAgent; workspaceSlug: string }) {
  return (
    <div className="t-card-lift flex items-center gap-3 rounded-lg border bg-card p-3">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: agent.avatar_color }}
      >
        {agent.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{agent.name}</h3>
          {!agent.is_builtin ? (
            <span className="shrink-0 rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Custom
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {agent.persona} · {agent.domain}
        </p>
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link href={`/${workspaceSlug}/agents/${agent.id}`}>
          <HugeiconsIcon icon={Call02Icon} className="size-4" />
          Call
        </Link>
      </Button>
    </div>
  );
}

function ContactListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="flex flex-col gap-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgentContactList({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useAgents(workspaceSlug);
  const [query, setQuery] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);

  const groups = groupAgentsByDomain(data ?? [], query);

  return (
    <>
      <AppHeader
        actions={
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents…"
              aria-label="Search agents"
              className="w-56"
            />
            <Button size="sm" onClick={() => setBuilderOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              New agent
            </Button>
          </div>
        }
      />
      <ContentWrapper className="p-6">
        {isPending ? (
          <ContactListSkeleton />
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load the agent roster"
            description="Something went wrong fetching the workspace's agents. Please try again."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : data.length === 0 ? (
          <EmptyState
            assetKey="board"
            title="No agents yet"
            description="Build a custom specialist to add them to the workspace roster."
            actions={[{ label: "New agent", onClick: () => setBuilderOpen(true) }]}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            assetKey="search-empty"
            title="No matching agents"
            description={`No agents match "${query}".`}
            actions={[{ label: "Clear search", onClick: () => setQuery("") }]}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.domain} className="flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.domain}
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.agents.map((agent) => (
                    <ContactRow key={agent.id} agent={agent} workspaceSlug={workspaceSlug} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </ContentWrapper>
      <AgentBuilderDialog
        workspaceSlug={workspaceSlug}
        open={builderOpen}
        onOpenChange={setBuilderOpen}
      />
    </>
  );
}
