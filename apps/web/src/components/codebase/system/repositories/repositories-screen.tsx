"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlusSignIcon, Search01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useRefreshRepository,
  useRepositories,
  useUpdateRepository,
} from "@/hooks/codebase/use-repositories";
import { ERepoAccess, type IProjectRepository } from "@/types";

import { ConnectRepositoriesDialog } from "./connect-repositories-dialog";
import { RepositoryPanel } from "./repository-panel";
import {
  RepoBulkBar,
  RepositoriesTable,
  type TSortKey,
} from "./repositories-table";

export function RepositoriesScreen({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: repos, isLoading, isError, refetch } = useRepositories(workspaceSlug, projectId);
  const update = useUpdateRepository(workspaceSlug, projectId);
  const refresh = useRefreshRepository(workspaceSlug, projectId);

  const [query, setQuery] = useState("");
  const [sort, setSortState] = useState<{ key: TSortKey; dir: "asc" | "desc" }>({
    key: "display_name",
    dir: "asc",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openRepo, setOpenRepo] = useState<IProjectRepository | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const all = repos ?? [];
  const filtered = all
    .filter(
      (r) =>
        r.display_name.toLowerCase().includes(query.trim().toLowerCase()) ||
        r.full_name.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      return String(a[sort.key]).localeCompare(String(b[sort.key])) * dir;
    });

  function setSort(key: TSortKey) {
    setSortState((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.id))));
  }

  function bulkSetAccess(access: ERepoAccess) {
    for (const id of selected) update.mutate({ repoId: id, payload: { default_access: access } });
    setSelected(new Set());
  }

  function bulkRefresh() {
    for (const id of selected) refresh.mutate(id);
    setSelected(new Set());
  }

  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Loading repositories…</p>;
  }
  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load repositories"
        description="Something went wrong loading this project's repositories."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  if (all.length === 0) {
    return (
      <>
        <EmptyState
          assetKey="generic"
          title="Connect a repository"
          description="Add one or many Git repositories to this project. Group them into System Bundles to work, run agents, and deliver across them together."
          actions={[{ label: "Connect repositories", onClick: () => setConnectOpen(true) }]}
        />
        <ConnectRepositoriesDialog
          open={connectOpen}
          onOpenChange={setConnectOpen}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          connected={all}
        />
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search repositories…"
            aria-label="Search repositories"
            className="pl-8"
          />
        </div>
        <Button onClick={() => setConnectOpen(true)}>
          <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          Connect repositories
        </Button>
      </div>

      {selected.size > 0 ? (
        <RepoBulkBar
          count={selected.size}
          onSetAccess={bulkSetAccess}
          onRefresh={bulkRefresh}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          No repositories match “{query}”.
        </p>
      ) : (
        <RepositoriesTable
          repos={filtered}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          sort={sort}
          onSort={setSort}
          actions={{
            onOpen: setOpenRepo,
            onRefresh: (r) => refresh.mutate(r.id),
            onSetAccess: (r, access) => update.mutate({ repoId: r.id, payload: { default_access: access } }),
            onMakePrimary: (r) => update.mutate({ repoId: r.id, payload: { is_primary: true } }),
          }}
        />
      )}

      <ConnectRepositoriesDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        connected={all}
      />
      <RepositoryPanel
        repo={openRepo}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onClose={() => setOpenRepo(null)}
      />
    </div>
  );
}
