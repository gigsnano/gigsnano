"use client";

import { useState } from "react";

import { useWorkspaceTree, useWorkspaceFile } from "@/hooks/project/use-projects";
import {
  buildRepoTree,
  collectFolderPaths,
  firstFilePath,
} from "@/lib/workspace/repo-tree";

import { RepoCodePreview } from "./repo-code-preview";
import { RepoFileTree } from "./repo-file-tree";

export function RepoFileExplorer({
  workspaceSlug,
  projectId,
  repoUrl,
  defaultBranch = "main",
}: {
  workspaceSlug: string;
  projectId: string;
  repoUrl: string;
  defaultBranch?: string;
}) {
  const { data: entries } = useWorkspaceTree(workspaceSlug, projectId);
  const tree = buildRepoTree(entries ?? []);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Seed the expanded folders + first selection once the tree loads. Done
  // during render (guarded so it runs once) — React commits it without an
  // extra painted frame, unlike a setState-in-effect.
  if (!initialized && tree.length > 0) {
    setExpanded(new Set(collectFolderPaths(tree)));
    setSelectedPath(firstFilePath(tree));
    setInitialized(true);
  }

  const file = useWorkspaceFile(workspaceSlug, projectId, selectedPath);

  const onToggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/20">
      <div className="grid min-h-[28rem] sm:grid-cols-[minmax(0,17rem)_1fr]">
        <div className="max-h-80 overflow-y-auto border-b bg-background/60 sm:max-h-none sm:border-b-0 sm:border-r">
          <div className="sticky top-0 z-10 border-b bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Files</span>
          </div>
          <RepoFileTree
            tree={tree}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={onToggle}
            onSelect={setSelectedPath}
          />
        </div>

        <RepoCodePreview
          path={selectedPath}
          content={file.data?.content ?? null}
          isLoading={file.isPending && Boolean(selectedPath)}
          isError={file.isError}
          repoUrl={repoUrl}
          defaultBranch={defaultBranch}
        />
      </div>
    </div>
  );
}
