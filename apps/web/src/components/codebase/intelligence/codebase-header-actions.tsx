"use client";

import { GitBranchIcon, MoreHorizontalIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { IndexStatusBanner } from "@/components/codebase/index-status-banner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIndexStatus } from "@/hooks/code/use-index-status";
import { useCodebaseUiStore } from "@/store/ui/codebase-ui.store";
import { EIndexStatus } from "@/types";

/**
 * Codebase Intelligence actions, hosted in the shared secondary bar (AppHeader)
 * via ProjectHeader — the page body no longer carries its own action row.
 * Ask Codebase opens the ask screen through the shared UI store; index status +
 * Re-index and Compare Branches are self-contained. Actions disable while the
 * repo is indexing (there's nothing to explore yet).
 */
export function CodebaseHeaderActions({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const openAsk = useCodebaseUiStore((s) => s.openAsk);
  const { status } = useIndexStatus(workspaceSlug, projectId);
  const busy = status === EIndexStatus.Pending || status === EIndexStatus.Indexing;
  const busyTitle = busy ? "Available once indexing finishes" : undefined;

  return (
    <div className="flex items-center gap-2">
      <IndexStatusBanner workspaceSlug={workspaceSlug} projectId={projectId} />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            title={busyTitle}
            className="active:scale-[0.97]"
          >
            <HugeiconsIcon icon={GitBranchIcon} className="size-4" />
            <span className="@max-2xl/cbh:sr-only">Compare Branches</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 text-sm text-muted-foreground">
          Branch comparison lands with commit-diff indexing. Pick a base and compare ref to see
          changed symbols and impacted stories.
        </PopoverContent>
      </Popover>

      <Button size="sm" onClick={openAsk} disabled={busy} title={busyTitle} className="active:scale-[0.97]">
        <HugeiconsIcon icon={SparklesIcon} className="size-4" />
        <span className="@max-2xl/cbh:sr-only">Ask Codebase</span>
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="More actions" disabled={busy} title={busyTitle}>
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          {["Export graph", "Copy graph link", "Index settings"].map((label) => (
            <button
              key={label}
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              {label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
