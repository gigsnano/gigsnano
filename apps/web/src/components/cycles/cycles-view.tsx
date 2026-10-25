"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { useCycles } from "@/hooks/project/use-cycles";
import { useProjectFeatureFlags } from "@/hooks/project/use-project-settings";
import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";
import { EmptyState } from "@/components/empty-state";
import { cyclePhase } from "@/lib/cycles/cycle-phase";
import { cn } from "@/lib/utils";
import { type ICycle } from "@/types";

import { ActiveCycles } from "./active-cycles";
import { CycleListRow } from "./cycle-list-row";

type TCycleTab = "active" | "upcoming" | "completed";
const TABS: { id: TCycleTab; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
];

export function CyclesView({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) {
  const [tab, setTab] = useState<TCycleTab>("active");
  const [query, setQuery] = useState("");

  const { cycles: cyclesEnabled, isPending: flagsPending } = useProjectFeatureFlags(workspaceSlug, projectId);
  const { data: cycles, isPending, isError, refetch } = useCycles(workspaceSlug, projectId);

  const activeIndex = TABS.findIndex((t) => t.id === tab);
  const { barRef, pillRef } = useSlidingTabs(Math.max(0, activeIndex));

  const buckets = (() => {
    const all = (cycles ?? []).filter((c) =>
      query.trim() ? c.name.toLowerCase().includes(query.trim().toLowerCase()) : true,
    );
    // Group by the phase derived from each cycle's date range (GIN-81), so a
    // cycle whose window contains today shows under Active, not Upcoming.
    const now = new Date();
    const grouped: Record<TCycleTab, ICycle[]> = { active: [], upcoming: [], completed: [] };
    for (const c of all) grouped[cyclePhase(c, now)].push(c);
    return grouped;
  })();

  if (!flagsPending && !cyclesEnabled) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="sprint"
          title="Cycles are disabled"
          description="Turn on Cycles in project settings to plan time-boxed sprints."
          actions={[{ label: "Project settings", href: `/${workspaceSlug}/settings/projects/${projectId}/features` }]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Sub-toolbar: tabs + search */}
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <div ref={barRef} className="relative flex items-center gap-0.5">
          <span
            ref={pillRef}
            className="t-issues-pill pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-foreground"
            aria-hidden
          />
          {TABS.map((t, i) => (
            <button
              key={t.id}
              type="button"
              data-tab-index={i}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
          <HugeiconsIcon icon={Search01Icon} className="size-4 text-muted-foreground" />
          <input
            aria-label="Search cycles"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-28 bg-transparent outline-none placeholder:text-muted-foreground focus:w-40"
          />
        </label>
      </div>

      {/* Loading / error */}
      {isPending ? (
        <div className="flex flex-col gap-px border-t">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse bg-card" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-6">
          <EmptyState
            assetKey="error"
            title="Couldn't load cycles"
            description="Something went wrong fetching cycles. Please try again."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        </div>
      ) : tab === "active" ? (
        <ActiveCycles cycles={buckets.active} workspaceSlug={workspaceSlug} projectId={projectId} />
      ) : tab === "upcoming" ? (
        buckets.upcoming.length === 0 ? (
          <div className="p-6">
            <EmptyState assetKey="sprint" title="No upcoming cycles" description="Draft cycles you schedule for later will appear here." />
          </div>
        ) : (
          <div className="border-t">
            {buckets.upcoming.map((c) => (
              <CycleListRow key={c.id} cycle={c} workspaceSlug={workspaceSlug} projectId={projectId} />
            ))}
          </div>
        )
      ) : buckets.completed.length === 0 ? (
        <div className="p-6">
          <EmptyState
            assetKey="sprint"
            title="No completed cycles yet"
            description="Completed cycles will appear here along with their performance metrics."
          />
        </div>
      ) : (
        <div className="border-t">
          {buckets.completed.map((c) => (
            <CycleListRow key={c.id} cycle={c} workspaceSlug={workspaceSlug} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  );
}
