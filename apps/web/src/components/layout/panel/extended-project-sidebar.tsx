"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { CreateContainerFlow } from "@/components/solutions";
import { EmptyState } from "@/components/empty-state";
import { useProjects } from "@/hooks/project/use-projects";
import { filterProjectsByQuery } from "@/lib/nav/project-search";
import { railBHiddenProjects } from "@/lib/nav/rail-b-projects";
import { railBContext } from "@/lib/nav/rail-b-context";
import { resolveActiveApp } from "@/lib/nav/workspace-nav";
import {
  PROJECTS_FLYOUT_TOGGLE_ID,
  useProjectsFlyoutStore,
} from "@/store/ui/projects-flyout.store";
import { useSidebarNav } from "@/store/ui/sidebar-nav.store";
import { usePathname } from "next/navigation";
import { ExtendedSidebarWrapper } from "./extended-sidebar-wrapper";
import { ProjectRow } from "./project-row";

const searchFieldClass =
  "h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Plane-style floating project browser: search + full project list of
 * single-line rows. Opened from the "More" row at the bottom of Rail B.
 */
export function ExtendedProjectSidebar({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const activeApp = resolveActiveApp(pathname, workspaceSlug);
  const { data: projects } = useProjects(workspaceSlug);
  const limitProjects = useSidebarNav((s) => s.limitProjects);
  const projectLimit = useSidebarNav((s) => s.projectLimit);
  const favorites = useSidebarNav((s) => s.favorites);
  const setOpen = useProjectsFlyoutStore((s) => s.setOpen);
  const [query, setQuery] = useState("");

  const hiddenProjects = railBHiddenProjects({
    projects: projects ?? [],
    limitProjects,
    projectLimit,
    favorites,
  });

  const filtered = filterProjectsByQuery(hiddenProjects, query);

  if (activeApp !== "workspace" || railBContext(pathname, workspaceSlug) === "project") return null;

  const closeFlyout = () => setOpen(false);

  return (
    <ExtendedSidebarWrapper excludedElementId={PROJECTS_FLYOUT_TOGGLE_ID} className="px-0 py-2">
      <div className="sticky top-0 z-[1] flex flex-col gap-3 border-b bg-background px-4 pb-3 pt-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">Projects</span>
          <CreateContainerFlow workspaceSlug={workspaceSlug}>
            <Button variant="ghost" size="icon-sm" aria-label="New project">
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
            </Button>
          </CreateContainerFlow>
        </div>

        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search projects"
            autoFocus
            className={searchFieldClass}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {!hiddenProjects.length ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            All projects are visible in the sidebar.
          </p>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-6">
            <EmptyState
              assetKey="search-empty"
              title="No projects found"
              description="Try a different name or identifier."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((project) => (
              <ProjectRow
                key={project.id}
                workspaceSlug={workspaceSlug}
                project={project}
                onNavigate={closeFlyout}
              />
            ))}
          </div>
        )}
      </div>
    </ExtendedSidebarWrapper>
  );
}
