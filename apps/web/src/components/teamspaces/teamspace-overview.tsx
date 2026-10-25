"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MoreHorizontalIcon,
  UserGroupIcon,
  AiBrain01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useMembers } from "@/hooks/workspace/use-members";
import {
  useDeleteTeamspace,
  useTeamspaceOverview,
  useTeamspaces,
} from "@/hooks/teamspace/use-teamspaces";
import { cn } from "@/lib/utils";

import { CreateTeamspaceDialog } from "./create-teamspace-dialog";

function Bar({ pct, over }: { pct: number; over?: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", over ? "bg-red-500" : "bg-primary")}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: typeof UserGroupIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon ? <HugeiconsIcon icon={icon} className="size-3.5" /> : null}
        {title}
      </p>
      {children}
    </section>
  );
}

export function TeamspaceOverview({
  workspaceSlug,
  teamspaceId,
}: {
  workspaceSlug: string;
  teamspaceId: string;
}) {
  const router = useRouter();
  const { data: teamspaces } = useTeamspaces(workspaceSlug);
  const { data, isPending, isError, refetch } = useTeamspaceOverview(workspaceSlug, teamspaceId);
  const { data: members } = useMembers(workspaceSlug);
  const del = useDeleteTeamspace(workspaceSlug);
  const [editing, setEditing] = useState(false);

  const teamspace = teamspaces?.find((t) => t.id === teamspaceId);
  const nameOf = (userId: string) =>
    userId === "unassigned"
      ? "Unassigned"
      : members?.find((m) => m.user_id === userId)?.display_name ?? "Member";

  const human = Object.entries(data?.human_workload ?? {}).sort((a, b) => b[1] - a[1]);
  const maxHuman = Math.max(1, ...human.map(([, n]) => n));
  const rollup = data?.rollup;
  const open = rollup ? rollup.total - rollup.done : 0;

  return (
    <>
      <AppHeader
        actions={
          teamspace ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" aria-label="Manage teamspace">
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                  Manage
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() =>
                    del.mutate(teamspaceId, {
                      onSuccess: () => router.push(`/${workspaceSlug}`),
                    })
                  }
                >
                  Delete teamspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />
      <ContentWrapper className="p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
          {/* Title */}
          <div>
            <h1 className="text-2xl font-semibold">{teamspace?.name ?? "Teamspace"}</h1>
            {teamspace?.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{teamspace.description}</p>
            ) : null}
          </div>

          {isPending ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : isError || !data ? (
            <EmptyState
              assetKey="error"
              align="start"
              title="Couldn't load this teamspace"
              description="Something went wrong fetching the overview."
              actions={[{ label: "Retry", onClick: () => refetch() }]}
            />
          ) : data.projects.length === 0 ? (
            <EmptyState
              assetKey="generic"
              title="No projects in this teamspace yet"
              description="Add projects so the team's work, workload and roadmap roll up here."
              actions={[{ label: "Manage teamspace", onClick: () => setEditing(true) }]}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Projects */}
                <Panel title="Projects" icon={Folder01Icon}>
                  <ul className="flex flex-col gap-1.5">
                    {data.projects.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/${workspaceSlug}/projects/${p.id}`}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/50"
                        >
                          <span className="text-base">{p.logo_emoji ?? "📁"}</span>
                          <span className="min-w-0 truncate">{p.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>

                {/* Active work (rollup) */}
                <Panel title="Active work">
                  <div className="flex items-baseline gap-4">
                    <Stat value={open} label="open" />
                    <Stat value={rollup?.done ?? 0} label="done" />
                    <Stat value={rollup?.total ?? 0} label="total" />
                  </div>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span className="tabular-nums">{rollup?.progress_pct ?? 0}%</span>
                    </div>
                    <Bar pct={rollup?.progress_pct ?? 0} />
                  </div>
                </Panel>
              </div>

              {/* Hybrid workload */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Panel title="People" icon={UserGroupIcon}>
                  <ul className="space-y-2.5">
                    {human.map(([userId, load]) => (
                      <li key={userId} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate">{nameOf(userId)}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{load} open</span>
                        </div>
                        <Bar pct={(load / maxHuman) * 100} />
                      </li>
                    ))}
                    {human.length === 0 ? (
                      <li className="text-xs text-muted-foreground">No open work.</li>
                    ) : null}
                  </ul>
                </Panel>

                <Panel title="Agents" icon={AiBrain01Icon}>
                  <ul className="space-y-2.5">
                    {data.agent_workload.map((a) => {
                      const over = a.active_load >= a.capacity;
                      return (
                        <li key={a.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate">{a.name}</span>
                            <span
                              className={cn(
                                "shrink-0 tabular-nums",
                                over ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
                              )}
                            >
                              {a.active_load}/{a.capacity}
                            </span>
                          </div>
                          <Bar pct={(a.active_load / a.capacity) * 100} over={over} />
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              </div>

              {/* Team roadmap rollup */}
              <Panel title="Team roadmap">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Bar pct={rollup?.progress_pct ?? 0} />
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {rollup?.progress_pct ?? 0}%
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Aggregate delivery across the team&apos;s projects. Per-initiative rollups arrive
                  with the roadmap views.
                </p>
              </Panel>

              {/* Pinned roster */}
              {data.pinned_roster.length ? (
                <Panel title="Roster">
                  <div className="flex flex-wrap gap-2">
                    {data.pinned_roster.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs"
                      >
                        <span className="font-medium">{r.name}</span>
                        {r.kind ? <span className="text-muted-foreground">{r.kind}</span> : null}
                      </span>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </>
          )}
        </div>
      </ContentWrapper>

      {editing && teamspace ? (
        <CreateTeamspaceDialog
          workspaceSlug={workspaceSlug}
          teamspace={teamspace}
          open={editing}
          onOpenChange={setEditing}
        />
      ) : null}
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
