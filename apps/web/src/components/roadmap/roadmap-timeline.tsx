"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateInitiative, useInitiatives } from "@/hooks/roadmap/use-roadmap";
import type { IInitiative } from "@/types";

import { DraftInitiativesDialog } from "./draft-initiatives-dialog";
import { InitiativeRow } from "./initiative-row";

function quarterKey(date: string | null): string {
  if (!date) return "Unscheduled";
  const d = new Date(`${date}T00:00:00`);
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

/** Chronological quarter groups; Unscheduled always last. */
function groupByQuarter(initiatives: IInitiative[]): [string, IInitiative[]][] {
  const sorted = [...initiatives].sort((a, b) => {
    if (!a.target_date) return 1;
    if (!b.target_date) return -1;
    return a.target_date < b.target_date ? -1 : 1;
  });
  const groups = new Map<string, IInitiative[]>();
  for (const i of sorted) {
    const key = quarterKey(i.target_date);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(i);
  }
  return [...groups.entries()];
}

export function RoadmapTimeline({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useInitiatives(workspaceSlug);
  const create = useCreateInitiative(workspaceSlug);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const initiatives = data ?? [];

  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), target_date: targetDate || null },
      {
        onSuccess: () => {
          setTitle("");
          setTargetDate("");
          setComposing(false);
        },
      },
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Cross-project initiatives with rollup progress and slip risk.
        </p>
        <div className="flex items-center gap-2">
          <DraftInitiativesDialog workspaceSlug={workspaceSlug} />
          <Button size="sm" onClick={() => setComposing((v) => !v)}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            New initiative
          </Button>
        </div>
      </div>

      {composing ? (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Initiative title"
              aria-label="Initiative title"
            />
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              aria-label="Target date"
              className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      ) : null}

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          assetKey="error"
          align="start"
          title="Couldn't load the roadmap"
          description="Something went wrong fetching initiatives."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      ) : initiatives.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No initiatives yet"
          description="Group work into strategic initiatives, or let the Analyst draft a first pass from a project brief."
          actions={[{ label: "New initiative", onClick: () => setComposing(true) }]}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groupByQuarter(initiatives).map(([quarter, items]) => (
            <section key={quarter}>
              <h2 className="mb-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {quarter}
              </h2>
              <div className="flex flex-col gap-2">
                {items.map((i) => (
                  <InitiativeRow key={i.id} workspaceSlug={workspaceSlug} initiative={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
