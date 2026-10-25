"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { AppHeader, ContentWrapper } from "@/components/layout";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { autoOpenDashboardId, BROWSE_PARAM } from "@/lib/dashboards/auto-open";
import { cn } from "@/lib/utils";
import { useCreateDashboard, useDashboards } from "@/hooks/workspace/use-dashboards";

import { DashboardCard } from "./dashboard-card";
import { DashboardFormDialog } from "./dashboard-form-dialog";

type Tab = "all" | "favorites";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favorites" },
];

export function DashboardsDirectory({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useDashboards(workspaceSlug);
  const create = useCreateDashboard(workspaceSlug);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  // With one dashboard the grid is a single card whose only job is one click.
  // `?browse=1` opts out, which is how the directory (and New dashboard) stays
  // reachable — see autoOpenDashboardId.
  const onlyId = autoOpenDashboardId(data, searchParams.get(BROWSE_PARAM) === "1");
  useEffect(() => {
    if (onlyId) router.replace(`/${workspaceSlug}/dashboards/${onlyId}`);
  }, [onlyId, router, workspaceSlug]);

  // Single pass; React Compiler memoizes derived values, so no useMemo.
  const q = query.trim().toLowerCase();
  const filtered = (data ?? []).filter(
    (d) =>
      (tab === "favorites" ? d.is_favorite : true) &&
      (!q ||
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q)),
  );

  const favoriteCount = (data ?? []).filter((d) => d.is_favorite).length;

  return (
    <>
      <AppHeader
        actions={
          !isError ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              New dashboard
            </Button>
          ) : undefined
        }
      />
      <ContentWrapper className="p-6">
        {isPending ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load dashboards"
            description="Something went wrong fetching your dashboards."
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : !data?.length ? (
          <EmptyState
            assetKey="generic"
            title="No dashboards yet"
            description="Create a personal dashboard to track work your way — widgets arrive next."
            actions={[{ label: "Create dashboard", onClick: () => setCreateOpen(true) }]}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {/* Toolbar: tabs + search */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                      tab === t.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                    {t.id === "favorites" && favoriteCount > 0 ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">{favoriteCount}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-64">
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search dashboards"
                  aria-label="Search dashboards"
                  className="w-full rounded-md border bg-background py-2 pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                assetKey="generic"
                title={tab === "favorites" ? "No favorite dashboards" : "No matches"}
                description={
                  tab === "favorites"
                    ? "Star a dashboard to keep it here."
                    : "No dashboards match your search."
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((dashboard, i) => (
                  <div
                    key={dashboard.id}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  >
                    <DashboardCard dashboard={dashboard} workspaceSlug={workspaceSlug} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ContentWrapper>

      <DashboardFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSubmit={async ({ name, description }) => {
          await create.mutateAsync({ name, description });
        }}
      />
    </>
  );
}
