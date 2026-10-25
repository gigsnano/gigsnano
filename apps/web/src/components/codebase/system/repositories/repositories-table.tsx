"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  MoreHorizontalIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";

import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ERepoAccess, type IProjectRepository } from "@/types";

import { RepoAccessBadge, RepoHealthBadge, RepoTypeBadge } from "./repo-badges";

export type TSortKey = "display_name" | "repository_type" | "default_branch" | "default_access" | "health";

export interface IRepoRowActions {
  onOpen: (repo: IProjectRepository) => void;
  onRefresh: (repo: IProjectRepository) => void;
  onSetAccess: (repo: IProjectRepository, access: ERepoAccess) => void;
  onMakePrimary: (repo: IProjectRepository) => void;
}

const COLUMNS: { key: TSortKey; label: string }[] = [
  { key: "display_name", label: "Repository" },
  { key: "repository_type", label: "Type" },
  { key: "default_branch", label: "Branch" },
  { key: "default_access", label: "Access" },
  { key: "health", label: "Health" },
];

export function RepositoriesTable({
  repos,
  selected,
  onToggle,
  onToggleAll,
  sort,
  onSort,
  actions,
}: {
  repos: IProjectRepository[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  sort: { key: TSortKey; dir: "asc" | "desc" };
  onSort: (key: TSortKey) => void;
  actions: IRepoRowActions;
}) {
  const allChecked = repos.length > 0 && repos.every((r) => selected.has(r.id));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="w-9 px-3 py-2">
                <Checkbox checked={allChecked} onCheckedChange={onToggleAll} aria-label="Select all repositories" />
              </th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className="inline-flex items-center gap-1 rounded outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {col.label}
                    {sort.key === col.key ? (
                      <HugeiconsIcon
                        icon={sort.dir === "asc" ? ArrowUp01Icon : ArrowDown01Icon}
                        className="size-3"
                      />
                    ) : null}
                  </button>
                </th>
              ))}
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {repos.map((repo) => (
              <tr key={repo.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                <td className="px-3 py-2.5">
                  <Checkbox
                    checked={selected.has(repo.id)}
                    onCheckedChange={() => onToggle(repo.id)}
                    aria-label={`Select ${repo.display_name}`}
                  />
                </td>
                <td className="max-w-0 px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {repo.is_primary ? (
                      <span className="shrink-0 text-amber-500" title="Primary repository" aria-label="Primary repository">
                        ★
                      </span>
                    ) : null}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => actions.onOpen(repo)}
                          className="min-w-0 truncate rounded text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {repo.display_name}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{repo.full_name}</TooltipContent>
                    </Tooltip>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <RepoTypeBadge type={repo.repository_type} />
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{repo.default_branch}</td>
                <td className="px-3 py-2.5">
                  <RepoAccessBadge access={repo.default_access} />
                </td>
                <td className="px-3 py-2.5">
                  <RepoHealthBadge health={repo.health} />
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Actions for ${repo.display_name}`}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => actions.onOpen(repo)}>Open details</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => actions.onRefresh(repo)}>
                        <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
                        Refresh
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() =>
                          actions.onSetAccess(
                            repo,
                            repo.default_access === ERepoAccess.Write ? ERepoAccess.Reference : ERepoAccess.Write,
                          )
                        }
                      >
                        {repo.default_access === ERepoAccess.Write ? "Set Reference access" : "Set Write access"}
                      </DropdownMenuItem>
                      {repo.is_primary ? null : (
                        <DropdownMenuItem onSelect={() => actions.onMakePrimary(repo)}>Make primary</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

/** A bulk-action bar shown above the table when rows are selected (GIN-410). */
export function RepoBulkBar({
  count,
  onSetAccess,
  onRefresh,
  onClear,
}: {
  count: number;
  onSetAccess: (access: ERepoAccess) => void;
  onRefresh: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm",
        "data-[mounted=false]:opacity-0",
      )}
    >
      <span className="font-medium">{count} selected</span>
      <div className="mx-1 h-4 w-px bg-border" />
      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onSetAccess(ERepoAccess.Write)}>
        Set Write
      </button>
      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onSetAccess(ERepoAccess.Reference)}>
        Set Reference
      </button>
      <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onRefresh}>
        Refresh
      </button>
      <div className="mx-1 h-4 w-px bg-border" />
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" disabled className="cursor-not-allowed text-muted-foreground/60">
              Add to bundle
            </button>
          </TooltipTrigger>
          <TooltipContent>Create a bundle from the Bundles tab to group these.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
