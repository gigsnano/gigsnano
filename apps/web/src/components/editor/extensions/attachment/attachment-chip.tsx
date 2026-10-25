"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Attachment01Icon, Download01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

import type { IAttachmentStore } from "./attachment-extension";
import type { IAttachmentAttrs } from "./types";

/** Human-readable file size, e.g. 1536 → "1.5 KB". */
function formatSize(bytes: number | undefined): string | null {
  if (!bytes || bytes < 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`;
}

export function AttachmentChip({ node, editor }: NodeViewProps) {
  const attrs = node.attrs as IAttachmentAttrs;
  const store = (editor.storage as unknown as { attachment?: IAttachmentStore }).attachment;

  const href = attrs.fileId ? store?.resolveUrl?.(attrs.fileId) : undefined;
  const size = formatSize(attrs.size);
  const fileName = attrs.fileName || "attachment";
  // Without a fileId there is nothing to resolve — show it as unresolved rather
  // than dropping the node, keeping any id for a later repair (ADR 0001 §4.1).
  const unresolved = !attrs.fileId;

  const inner = (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          unresolved ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <HugeiconsIcon icon={Attachment01Icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", unresolved && "line-through")}>
          {fileName}
        </span>
        {size ? <span className="block text-xs text-muted-foreground">{size}</span> : null}
      </span>
      {href ? (
        <HugeiconsIcon
          icon={Download01Icon}
          className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
        />
      ) : null}
    </>
  );

  return (
    <NodeViewWrapper
      className="my-1.5"
      data-file-id={attrs.fileId}
      data-unresolved={unresolved || undefined}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2 transition-colors hover:bg-accent"
          title={unresolved ? undefined : `Download ${fileName}`}
        >
          {inner}
        </a>
      ) : (
        <div
          className="flex items-center gap-2.5 rounded-lg border border-dashed bg-muted/20 px-3 py-2"
          title="This file is no longer available"
        >
          {inner}
        </div>
      )}
    </NodeViewWrapper>
  );
}
