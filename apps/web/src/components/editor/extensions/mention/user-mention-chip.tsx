"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import { cn } from "@/lib/utils";

import type { IUserMentionAttrs } from "./types";

export function UserMentionChip({ node, extension }: NodeViewProps) {
  const attrs = node.attrs as IUserMentionAttrs;
  const resolveName = extension.options.resolveDisplayName as
    | ((userId: string) => string | undefined)
    | undefined;

  // Resolve by id first so a renamed user reads correctly, then fall back to the
  // label captured when the mention was inserted (ADR 0001 section 4.1).
  const resolved = attrs.entityId ? resolveName?.(attrs.entityId) : undefined;
  const displayName = resolved ?? attrs.label;

  // A target we cannot name is shown as *unresolved*, not silently flattened to
  // plain text: the reader can see that something is referenced and that it is
  // no longer reachable. The node itself is untouched, so the id survives the
  // round trip and the mention repairs itself if the target comes back.
  const unresolved = !displayName;

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        className={cn(
          "gn-mention inline rounded-sm px-1 py-0.5 font-medium",
          unresolved
            ? "bg-muted text-muted-foreground line-through decoration-muted-foreground/50"
            : "bg-primary/10 text-primary",
        )}
        data-entity-identifier={attrs.entityId}
        data-entity-name={`${attrs.entityType ?? "user"}_mention`}
        data-unresolved={unresolved || undefined}
        title={unresolved ? "This user is no longer available" : undefined}
      >
        @{displayName ?? "unknown user"}
      </span>
    </NodeViewWrapper>
  );
}
