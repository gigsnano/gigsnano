"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import type { IWorkItemRefStore } from "./work-item-ref-extension";
import type { IWorkItemRefAttrs } from "./types";

export function WorkItemRefChip({ node, editor }: NodeViewProps) {
  const router = useRouter();
  const attrs = node.attrs as IWorkItemRefAttrs;
  const store = (editor.storage as unknown as { workItemRef?: IWorkItemRefStore }).workItemRef;

  // Resolve by id first so a renamed/re-coded target reads correctly, then fall
  // back to the code captured at insert time (ADR 0001 s4.1).
  const target = attrs.workItemId ? store?.items.find((w) => w.id === attrs.workItemId) : undefined;
  const code = target?.code ?? attrs.code;
  const title = target?.title ?? attrs.title;
  const href = attrs.workItemId ? store?.resolveHref?.(attrs.workItemId) : undefined;

  // A target we can neither resolve nor name is shown *unresolved* rather than
  // dropped: the id survives the round trip and the chip repairs itself if the
  // target returns.
  const unresolved = !code;

  const navigate = () => {
    if (href) router.push(href);
  };

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        role={href ? "link" : undefined}
        tabIndex={href ? 0 : undefined}
        title={unresolved ? "This work item is no longer available" : title || undefined}
        // preventDefault keeps the click from placing a caret inside the editor.
        onMouseDown={(e) => {
          if (!href) return;
          e.preventDefault();
          navigate();
        }}
        onKeyDown={(e) => {
          if (href && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            navigate();
          }
        }}
        className={cn(
          "gn-work-item-ref inline rounded-sm px-1 py-0.5 font-medium",
          href && "cursor-pointer",
          unresolved
            ? "bg-muted text-muted-foreground line-through decoration-muted-foreground/50"
            : "bg-primary/10 text-primary hover:bg-primary/20",
        )}
        data-work-item-id={attrs.workItemId}
        data-code={code || undefined}
        data-unresolved={unresolved || undefined}
      >
        {code ?? "unknown work item"}
      </span>
    </NodeViewWrapper>
  );
}
