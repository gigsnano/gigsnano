"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProjectLogo } from "@/components/projects/project-logo";
import { useProjects } from "@/hooks/project/use-projects";
import { filterProjectsByQuery } from "@/lib/nav/project-search";
import { switchProjectHref } from "@/lib/nav/rail-b-context";
import { resolveProjectSolutionKey } from "@/lib/solutions/container-adapter";
import { SOLUTIONS_ENABLED } from "@/lib/solutions/solutions-flag";
import { cn } from "@/lib/utils";
import type { IProject } from "@/types";

/** Project-context header: current project + a searchable jump list (keeps the section). */
export function ProjectSwitcher({
  workspaceSlug,
  project,
}: {
  workspaceSlug: string;
  project: IProject;
}) {
  const pathname = usePathname();
  const { data: projects } = useProjects(workspaceSlug);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = filterProjectsByQuery(projects ?? [], query);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Switch project (current: ${project.name})`}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm font-medium text-sidebar-foreground outline-none",
            "transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]",
            "hover:bg-sidebar-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-sidebar-accent/60",
          )}
        >
          <ProjectLogo project={project} size="xs" />
          <span title={project.name} className="min-w-0 flex-1 truncate text-left">
            {project.name}
          </span>
          <HugeiconsIcon icon={UnfoldMoreIcon} className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="relative border-b p-2">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Switch project…"
            aria-label="Search projects"
            className="h-8 w-full rounded-md bg-transparent pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <nav aria-label="Projects" className="flex max-h-72 flex-col gap-0.5 overflow-y-auto p-1">
          {results.length ? (
            results.map((p) => {
              const current = p.id === project.id;
              return (
                <Link
                  key={p.id}
                  href={switchProjectHref(
                    pathname,
                    workspaceSlug,
                    project.id,
                    p.id,
                    SOLUTIONS_ENABLED ? resolveProjectSolutionKey(p) : undefined,
                  )}
                  onClick={() => onOpenChange(false)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors duration-150",
                    "hover:bg-accent focus-visible:bg-accent",
                    current ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  <ProjectLogo project={p} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {current ? (
                    <HugeiconsIcon icon={Tick02Icon} className="size-3.5 shrink-0" />
                  ) : null}
                </Link>
              );
            })
          ) : (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">No projects found</p>
          )}
        </nav>
      </PopoverContent>
    </Popover>
  );
}
