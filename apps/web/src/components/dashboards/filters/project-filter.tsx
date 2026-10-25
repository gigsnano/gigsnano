"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Folder01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { ProjectLogo } from "@/components/projects/project-logo";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjects } from "@/hooks/project/use-projects";
import type { IProject } from "@/types";

const STACK_MAX = 3;

/**
 * Multi-select of the projects a dashboard covers. Empty selection = all.
 *
 * The trigger names what's selected rather than counting it where it can: one
 * project shows its name, several show their stacked logos and a count.
 */
export function ProjectFilter({
  workspaceSlug,
  value,
  onChange,
}: {
  workspaceSlug: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { data: projects = [], isPending } = useProjects(workspaceSlug, true);
  const selectedSet = new Set(value);
  // Ids of since-deleted projects stay in the stored filter but aren't shown.
  const selected = projects.filter((p) => selectedSet.has(p.id));

  const toggle = (id: string) =>
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-active={selected.length > 0 || undefined}
          className="gn-filter-trigger max-w-64 gap-2"
        >
          <ProjectTriggerLabel selected={selected} />
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 origin-(--radix-popover-content-transform-origin) p-0"
      >
        <Command>
          <CommandInput placeholder="Search projects…" aria-label="Search projects" />
          <CommandList>
            <CommandEmpty>{isPending ? "Loading projects…" : "No projects found."}</CommandEmpty>
            <CommandGroup>
              {projects.map((p) => {
                const checked = selectedSet.has(p.id);
                return (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.identifier}`}
                    onSelect={() => toggle(p.id)}
                    className="gap-2.5"
                  >
                    <span
                      aria-hidden
                      data-checked={checked || undefined}
                      className="gn-filter-check flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input"
                    >
                      <HugeiconsIcon icon={Tick02Icon} className="size-3" strokeWidth={2.5} />
                    </span>
                    <ProjectLogo project={p} size="xs" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {p.identifier}
                    </span>
                    <span className="sr-only">{checked ? "selected" : "not selected"}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {projects.length > 0 ? (
            <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
              <span className="tabular-nums text-muted-foreground">
                {selected.length ? `${selected.length} of ${projects.length}` : "All projects"}
              </span>
              <button
                type="button"
                disabled={value.length === 0}
                onClick={() => onChange([])}
                className="font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                Show all
              </button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProjectTriggerLabel({ selected }: { selected: IProject[] }) {
  if (selected.length === 0) {
    return (
      <>
        <HugeiconsIcon icon={Folder01Icon} className="size-4 text-muted-foreground" />
        <span key="all" className="t-label-swap">All projects</span>
      </>
    );
  }
  if (selected.length === 1) {
    return (
      <>
        <ProjectLogo project={selected[0]} size="xs" />
        <span key={selected[0].id} className="t-label-swap truncate">
          {selected[0].name}
        </span>
      </>
    );
  }
  const shown = selected.slice(0, STACK_MAX);
  return (
    <>
      <span className="flex -space-x-1.5">
        {shown.map((p) => (
          <ProjectLogo
            key={p.id}
            project={p}
            size="xs"
            className="bg-card ring-2 ring-background"
          />
        ))}
      </span>
      <span key={selected.length} className="t-label-swap tabular-nums">
        {selected.length} projects
      </span>
    </>
  );
}
