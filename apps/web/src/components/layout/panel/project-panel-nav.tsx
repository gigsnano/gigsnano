"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { useProjectNavRoutes, useRailProject } from "@/hooks/project/use-project-nav-routes";
import { isProjectPanelRouteActive } from "@/lib/nav/project-panel-routes";
import { PanelNavLink } from "./panel-nav";
import { ProjectContextMenu } from "./project-context-menu";
import { ProjectSwitcher } from "./project-switcher";

/**
 * Rail B in project context (drill-in): back to the workspace, a project
 * switcher, then only this project's rows. Mirrors ProjectSettingsNav's back row.
 */
export function ProjectPanelNav({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const pathname = usePathname();
  const project = useRailProject(workspaceSlug, projectId);
  const routes = useProjectNavRoutes(workspaceSlug, projectId);

  return (
    <div className="flex flex-1 flex-col gap-0.5 px-3 pb-3">
      <Link
        href={`/${workspaceSlug}/projects`}
        className="group/back mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          className="size-4 transition-transform duration-150 ease-out group-hover/back:-translate-x-0.5 motion-reduce:transition-none"
        />
        Workspace
      </Link>

      <div className="flex items-center gap-1 pb-2 pt-1">
        {project ? (
          <>
            <ProjectSwitcher workspaceSlug={workspaceSlug} project={project} />
            <ProjectContextMenu workspaceSlug={workspaceSlug} project={project} />
          </>
        ) : (
          <div className="h-8 flex-1 animate-pulse rounded-md bg-sidebar-accent/60" />
        )}
      </div>

      <nav aria-label="Project" className="flex flex-col gap-0.5">
        {routes.map((route) => (
          <PanelNavLink
            key={route.path}
            href={route.path}
            label={route.label}
            icon={route.icon}
            active={isProjectPanelRouteActive(pathname, route)}
          />
        ))}
      </nav>
    </div>
  );
}
