"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ACCESS_LABEL, REPOSITORY_TYPE_LABEL } from "@/constants/codebase-meta";
import { useArchiveRepository } from "@/hooks/codebase/use-repositories";
import type { IProjectRepository } from "@/types";

import { RepoHealthBadge } from "./repo-badges";

/** Right-side detail panel so opening a repo never loses the table context (GIN-410). */
export function RepositoryPanel({
  repo,
  workspaceSlug,
  projectId,
  onClose,
}: {
  repo: IProjectRepository | null;
  workspaceSlug: string;
  projectId: string;
  onClose: () => void;
}) {
  const archive = useArchiveRepository(workspaceSlug, projectId);
  const [confirming, setConfirming] = useState(false);

  function disconnect() {
    if (!repo) return;
    archive.mutate(repo.id, {
      onSuccess: () => {
        setConfirming(false);
        onClose();
      },
    });
  }

  return (
    <Sheet
      open={Boolean(repo)}
      onOpenChange={(o) => {
        if (!o) {
          setConfirming(false);
          onClose();
        }
      }}
    >
      <SheetContent className="max-w-md">
        {repo ? (
          <div className="flex h-full flex-col">
            <div className="border-b px-5 py-4">
              <SheetTitle className="flex items-center gap-2">
                {repo.is_primary ? (
                  <span className="text-amber-500" aria-label="Primary repository" title="Primary repository">
                    ★
                  </span>
                ) : null}
                <span className="truncate">{repo.display_name}</span>
              </SheetTitle>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{repo.full_name}</p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
              <Field label="Type" value={REPOSITORY_TYPE_LABEL[repo.repository_type]} />
              <Field label="Default branch" value={repo.default_branch} />
              <Field label="Default access" value={ACCESS_LABEL[repo.default_access]} />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Health</span>
                <RepoHealthBadge health={repo.health} />
              </div>
              <Field label="Clone" value={repo.clone_status} />
              <Field label="Sync" value={repo.sync_status} />
              <Field label="Index" value={repo.index_status} />
              <Field label="Indexed commit" value={repo.indexed_commit_sha ?? "—"} />
              <Field label="In bundles" value={String(repo.bundle_ids.length)} />
            </div>

            <div className="border-t px-5 py-4">
              {confirming ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    Disconnect <span className="font-medium">{repo.display_name}</span>?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {repo.is_primary ? "This is the Primary repository. " : ""}
                    {repo.bundle_ids.length > 0
                      ? `It is used by ${repo.bundle_ids.length} bundle${repo.bundle_ids.length === 1 ? "" : "s"}. Those bundles and any work items using them will be affected.`
                      : "It is not used by any bundle."}
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" size="sm" onClick={disconnect} disabled={archive.isPending}>
                      {archive.isPending ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="destructive" className="w-full" onClick={() => setConfirming(true)}>
                  Disconnect repository
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] truncate text-foreground">{value}</span>
    </div>
  );
}
