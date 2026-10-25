"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { REPOSITORY_TYPE_LABEL, REPOSITORY_TYPE_OPTIONS } from "@/constants/codebase-meta";
import { useGitHubRepos } from "@/hooks/auth/use-auth";
import { useBulkConnectRepositories } from "@/hooks/codebase/use-repositories";
import { cn } from "@/lib/utils";
import { ERepositoryType, type IConnectResult, type IProjectRepository } from "@/types";

/**
 * Bulk-select provider repositories and connect them in one flow (GIN-410).
 * Already-connected repos are shown disabled; connect returns a per-repo result
 * so a single failure never rolls back the batch.
 */
export function ConnectRepositoriesDialog({
  open,
  onOpenChange,
  workspaceSlug,
  projectId,
  connected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  projectId: string;
  connected: IProjectRepository[];
}) {
  const { data: repos = [], isLoading } = useGitHubRepos(workspaceSlug, open);
  const connect = useBulkConnectRepositories(workspaceSlug, projectId);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<ERepositoryType>(ERepositoryType.Service);
  const [results, setResults] = useState<IConnectResult[] | null>(null);

  const connectedNames = new Set(connected.map((r) => r.full_name));
  const filtered = repos.filter((r) => r.full_name.toLowerCase().includes(query.trim().toLowerCase()));

  function toggle(fullName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  }

  function reset() {
    setSelected(new Set());
    setQuery("");
    setResults(null);
    setType(ERepositoryType.Service);
  }

  function submit() {
    const chosen = repos.filter((r) => selected.has(r.full_name));
    connect.mutate(
      {
        repositories: chosen.map((r) => ({
          external_repository_id: r.full_name,
          full_name: r.full_name,
          default_branch: r.default_branch,
          repository_type: type,
        })),
      },
      {
        onSuccess: (res) => {
          setResults(res);
          setSelected(new Set());
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect repositories</DialogTitle>
          <DialogDescription>
            Select one or many repositories from your Git provider. You can change the type per repository later.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <ConnectResultList results={results} onDone={() => onOpenChange(false)} onMore={reset} />
        ) : (
          <>
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories…"
                aria-label="Search repositories"
                className="pl-8"
              />
            </div>

            <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {isLoading ? (
                <p className="p-4 text-center text-sm text-muted-foreground">Loading repositories…</p>
              ) : filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No repositories match “{query}”.</p>
              ) : (
                filtered.map((r) => {
                  const already = connectedNames.has(r.full_name);
                  const checked = selected.has(r.full_name);
                  return (
                    <label
                      key={r.full_name}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 text-sm transition-colors",
                        already ? "cursor-not-allowed opacity-50" : "hover:bg-muted",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={already}
                        onCheckedChange={() => toggle(r.full_name)}
                        aria-label={`Select ${r.full_name}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{r.full_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {already ? "Connected" : r.default_branch}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="repo-type" className="text-xs text-muted-foreground">
                Default type
              </label>
              <select
                id="repo-type"
                value={type}
                onChange={(e) => setType(e.target.value as ERepositoryType)}
                className="h-8 rounded-md border bg-input/30 px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {REPOSITORY_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {REPOSITORY_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={selected.size === 0 || connect.isPending}>
                {connect.isPending
                  ? "Connecting…"
                  : `Connect ${selected.size || ""} ${selected.size === 1 ? "repository" : "repositories"}`.trim()}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectResultList({
  results,
  onDone,
  onMore,
}: {
  results: IConnectResult[];
  onDone: () => void;
  onMore: () => void;
}) {
  const okCount = results.filter((r) => r.ok).length;
  return (
    <>
      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
        {results.map((r) => (
          <div key={r.full_name} className="flex items-center justify-between px-2 py-1.5 text-sm">
            <span className="min-w-0 flex-1 truncate">{r.full_name}</span>
            <span className={cn("shrink-0 text-xs font-medium", r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {r.ok ? "Connected" : r.error ?? "Failed"}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {okCount} of {results.length} connected.
      </p>
      <DialogFooter>
        <Button variant="ghost" onClick={onMore}>
          Connect more
        </Button>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </>
  );
}
