"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import { nodeTypeMeta, riskToneClass } from "@/lib/code/node-type";
import type { ICodeTreeNode } from "@/types/code/intelligence";

/** Hierarchical repository explorer; stays in sync with the graph via selection. */
export function CodeExplorer({
  tree,
  selectedId,
  onSelect,
  query,
  onQuery,
}: {
  /** Null until the code graph loads — the explorer used to be handed a fixture tree
   * of files that don't exist in this repo (GIN-154). */
  tree: ICodeTreeNode | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const q = query.trim().toLowerCase();
  return (
    <div className="flex size-full flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search files & modules…"
            aria-label="Search codebase explorer"
            className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-sm outline-none transition-colors focus:border-primary/50"
          />
        </div>
      </div>
      <div role="tree" aria-label="Repository files" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {!tree ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Files appear once the repo is indexed.
          </p>
        ) : (
          <TreeNode
            node={tree}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            query={q}
            defaultOpen
            forceOpenIds={selectedId ? new Set(ancestorIdsOf(tree, selectedId) ?? []) : EMPTY_SET}
          />
        )}
      </div>
    </div>
  );
}

const EMPTY_SET: ReadonlySet<string> = new Set();

function nodeMatches(node: ICodeTreeNode, q: string): boolean {
  if (!q) return true;
  if (node.name.toLowerCase().includes(q)) return true;
  return (node.children ?? []).some((c) => nodeMatches(c, q));
}

/** Ids of every ancestor folder above `targetId` (root-first), or null if not found. */
function ancestorIdsOf(node: ICodeTreeNode, targetId: string, path: string[] = []): string[] | null {
  if (node.id === targetId) return path;
  for (const c of node.children ?? []) {
    const found = ancestorIdsOf(c, targetId, [...path, node.id]);
    if (found) return found;
  }
  return null;
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  query,
  defaultOpen = false,
  forceOpenIds,
}: {
  node: ICodeTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  defaultOpen?: boolean;
  forceOpenIds: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(defaultOpen || depth < 1);
  const meta = nodeTypeMeta(node.type);
  const hasChildren = (node.children?.length ?? 0) > 0;
  // Ancestors of the currently selected node are force-expanded (derived at
  // render time, not via setState-in-effect) so a graph-driven selection is
  // always visible in the tree without fighting the user's manual toggles.
  const expanded = open || query.length > 0 || forceOpenIds.has(node.id);
  const selected = selectedId === node.id;
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected, selectedId]);

  if (query && !nodeMatches(node, query)) return null;

  return (
    <div>
      <div
        ref={rowRef}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? expanded : undefined}
        tabIndex={0}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 rounded-md py-1 pr-1.5 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          selected ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/60",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => {
          if (hasChildren) setOpen(!expanded);
          onSelect(node.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (hasChildren) setOpen(!expanded);
            onSelect(node.id);
          }
        }}
      >
        {hasChildren ? (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-90",
            )}
          />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <HugeiconsIcon icon={meta.icon} className={cn("size-4 shrink-0", meta.toneClass)} />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.risk ? (
          <span className={cn("text-[10px] font-medium uppercase", riskToneClass(node.risk))}>
            {node.risk}
          </span>
        ) : null}
        {typeof node.nodeCount === "number" ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">{node.nodeCount}</span>
        ) : null}
      </div>
      {hasChildren && expanded ? (
        <div>
          {node.children!.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              query={query}
              forceOpenIds={forceOpenIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
