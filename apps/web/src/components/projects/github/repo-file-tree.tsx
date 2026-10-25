"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  File01Icon,
  Folder01Icon,
  FolderOpenIcon,
} from "@hugeicons/core-free-icons";

import type { IRepoTreeNode } from "@/lib/workspace/repo-tree";
import { cn } from "@/lib/utils";

function TreeRow({
  node,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onSelect,
}: {
  node: IRepoTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const pad = depth * 14;

  if (node.kind === "folder") {
    const isOpen = expanded.has(node.path);
    return (
      <>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm text-foreground transition-transform duration-150 ease-out active:scale-[0.98] hover:bg-accent/50"
          style={{ paddingLeft: pad + 8 }}
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
              isOpen && "rotate-90",
            )}
          />
          <HugeiconsIcon
            icon={isOpen ? FolderOpenIcon : Folder01Icon}
            className="size-4 shrink-0 text-amber-500/80"
          />
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {isOpen
          ? node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))
          : null}
      </>
    );
  }

  const active = selectedPath === node.path;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm transition-transform duration-150 ease-out active:scale-[0.98]",
        active
          ? "bg-primary/10 font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
      style={{ paddingLeft: pad + 28 }}
    >
      <HugeiconsIcon icon={File01Icon} className="size-4 shrink-0 text-sky-500/80" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function RepoFileTree({
  tree,
  expanded,
  selectedPath,
  onToggle,
  onSelect,
}: {
  tree: IRepoTreeNode[];
  expanded: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  if (tree.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No files in this workspace yet.
      </p>
    );
  }

  return (
    <nav aria-label="Repository files" className="p-1.5">
      {tree.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          selectedPath={selectedPath}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}
