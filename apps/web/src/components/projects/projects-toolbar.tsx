"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Search01Icon,
  Cancel01Icon,
  Add01Icon,
  DashboardSquare01Icon,
  Menu01Icon,
  GridTableIcon,
  ChartGanttIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { EProjectView } from "@/types";
import { useProjects } from "@/hooks/project/use-projects";
import { useLimitStatus } from "@/hooks/billing/use-entitlements";
import { EEntitlementLimit } from "@/constants/plans";

import { CreateContainerFlow } from "@/components/solutions";

const VIEWS: { value: EProjectView; label: string; icon: typeof DashboardSquare01Icon }[] = [
  { value: EProjectView.Gallery, label: "Gallery", icon: DashboardSquare01Icon },
  { value: EProjectView.List, label: "List", icon: Menu01Icon },
  { value: EProjectView.Table, label: "Table", icon: GridTableIcon },
  { value: EProjectView.Timeline, label: "Timeline", icon: ChartGanttIcon },
];

export function ProjectsToolbar({
  workspaceSlug,
  view,
  onViewChange,
  query,
  onQueryChange,
}: {
  workspaceSlug: string;
  view: EProjectView;
  onViewChange: (v: EProjectView) => void;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: projects } = useProjects(workspaceSlug);
  const { atLimit: projectsAtLimit } = useLimitStatus(
    workspaceSlug, EEntitlementLimit.Projects, projects?.length ?? 0,
  );

  const openSearch = () => {
    setSearchOpen(true);
    // focus after the width transition begins
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const closeSearchIfEmpty = () => {
    if (!query) setSearchOpen(false);
  };

  const clearAndClose = () => {
    onQueryChange("");
    setSearchOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Expanding search */}
      <div
        className={cn(
          "flex items-center overflow-hidden rounded-md transition-all duration-200 ease-out",
          searchOpen ? "w-56 border bg-input/30 px-2" : "w-8",
        )}
      >
        {searchOpen ? (
          <>
            <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
            <Label id="projects-search-label" htmlFor="projects-search" className="sr-only">
              Search projects
            </Label>
            <input
              id="projects-search"
              aria-labelledby="projects-search-label"
              ref={inputRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onBlur={closeSearchIfEmpty}
              placeholder="Search projects…"
              className="h-8 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                type="button"
                onClick={clearAndClose}
                aria-label="Clear search"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </button>
            ) : null}
          </>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Search projects" onClick={openSearch}>
            <HugeiconsIcon icon={Search01Icon} className="size-4" />
          </Button>
        )}
      </div>

      {/* View switcher */}
      <div className="flex items-center rounded-md border bg-input/30 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-label={v.label}
            aria-pressed={view === v.value}
            onClick={() => onViewChange(v.value)}
            className={cn(
              "flex size-7 items-center justify-center rounded transition-colors",
              view === v.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={v.icon} className="size-4" />
          </button>
        ))}
      </div>

      {/* Primary action */}
      {projectsAtLimit ? (
        <Button size="sm" variant="outline" asChild>
          <Link
            href={`/${workspaceSlug}/settings/billing`}
            title="Free includes 3 projects — upgrade for unlimited"
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Upgrade to add
          </Link>
        </Button>
      ) : (
        <CreateContainerFlow workspaceSlug={workspaceSlug}>
          <Button size="sm">
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add Project
          </Button>
        </CreateContainerFlow>
      )}
    </div>
  );
}
