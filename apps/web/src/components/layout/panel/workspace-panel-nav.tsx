"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { CreateContainerFlow } from "@/components/solutions";
import { useProjects } from "@/hooks/project/use-projects";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  PERSONAL_ANCHOR,
  WORKSPACE_ANCHOR,
  PERSONAL_ITEMS,
  WORKSPACE_ITEMS,
  splitPinned,
  type ISidebarNavItem,
} from "@/lib/nav/sidebar-nav-items";
import { railBHiddenProjects, railBProjectRows } from "@/lib/nav/rail-b-projects";
import { useSidebarNav } from "@/store/ui/sidebar-nav.store";
import {
  PROJECTS_FLYOUT_TOGGLE_ID,
  useProjectsFlyoutStore,
} from "@/store/ui/projects-flyout.store";
import { PanelCollapsibleSection, PanelNavLink } from "./panel-nav";
import { ProjectRow } from "./project-row";
import { TeamspacesSection } from "./teamspaces-section";

/** A workspace nav link that derives its href + active state from the item + route. */
function NavLinkItem({
  item,
  base,
  pathname,
}: {
  item: ISidebarNavItem;
  base: string;
  pathname: string;
}) {
  const href = item.href(base);
  const active = item.exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  return <PanelNavLink href={href} label={item.label} icon={item.icon} active={active} />;
}

export function WorkspacePanelNav({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}`;
  const { data: projects } = useProjects(workspaceSlug);

  const personalPrefs = useSidebarNav((s) => s.personal);
  const workspacePrefs = useSidebarNav((s) => s.workspace);
  const limitProjects = useSidebarNav((s) => s.limitProjects);
  const projectLimit = useSidebarNav((s) => s.projectLimit);
  const favorites = useSidebarNav((s) => s.favorites);
  const flyoutOpen = useProjectsFlyoutStore((s) => s.open);
  const toggleFlyout = useProjectsFlyoutStore((s) => s.toggle);

  const personal = splitPinned(personalPrefs, PERSONAL_ITEMS);
  const workspace = splitPinned(workspacePrefs, WORKSPACE_ITEMS);
  const overflow = [...personal.overflow, ...workspace.overflow];

  const railOptions = {
    projects: projects ?? [],
    limitProjects,
    projectLimit,
    favorites,
  };
  const projectRows = railBProjectRows(railOptions);
  const hiddenCount = railBHiddenProjects(railOptions).length;

  return (
    <div className="flex flex-1 flex-col gap-0.5 px-3 pb-3">
      {/* Group 1 — New project + Home + pinned Personal items */}
      <div className="py-2">
        <CreateContainerFlow workspaceSlug={workspaceSlug}>
          <Button size="sm" className="w-full justify-start">
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            New project
          </Button>
        </CreateContainerFlow>
      </div>
      <NavLinkItem item={PERSONAL_ANCHOR} base={base} pathname={pathname} />
      {personal.pinned.map((item) => (
        <NavLinkItem key={item.id} item={item} base={base} pathname={pathname} />
      ))}

      {/* More — hidden Personal + Workspace items */}
      {overflow.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 ease-out",
                "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                "focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-sidebar-accent/60 data-[state=open]:text-sidebar-foreground",
              )}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4 shrink-0" />
              <span className="truncate">More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            {overflow.map((item) => (
              <DropdownMenuItem key={item.id} asChild>
                <Link href={item.href(base)}>
                  <HugeiconsIcon icon={item.icon} className="size-4" />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {/* Group 2 — Workspace list pages (Projects anchor + pinned workspace items) */}
      <div className="pt-2">
        <PanelCollapsibleSection title="Workspace">
          <NavLinkItem item={WORKSPACE_ANCHOR} base={base} pathname={pathname} />
          {workspace.pinned.map((item) => (
            <NavLinkItem key={item.id} item={item} base={base} pathname={pathname} />
          ))}
        </PanelCollapsibleSection>
      </div>

      <TeamspacesSection workspaceSlug={workspaceSlug} />

      {/* Group 3 — project rows: favorites pinned first, single-line, drill in on click */}
      <div className="pt-1">
        <PanelCollapsibleSection title="Projects">
          {projectRows.length ? (
            <>
              {projectRows.map(({ project, favorite }) => (
                <ProjectRow
                  key={project.id}
                  workspaceSlug={workspaceSlug}
                  project={project}
                  favorite={favorite}
                />
              ))}
              {hiddenCount > 0 ? (
                <button
                  type="button"
                  id={PROJECTS_FLYOUT_TOGGLE_ID}
                  onClick={toggleFlyout}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors",
                    "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    flyoutOpen && "bg-sidebar-accent/40 text-sidebar-foreground",
                  )}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4 shrink-0" />
                  <span>{flyoutOpen ? "Hide" : "More"}</span>
                  {!flyoutOpen ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      ({hiddenCount} more)
                    </span>
                  ) : null}
                </button>
              ) : null}
            </>
          ) : (
            <p className="px-2.5 py-1.5 text-sm text-muted-foreground">No projects yet.</p>
          )}
        </PanelCollapsibleSection>
      </div>
    </div>
  );
}
