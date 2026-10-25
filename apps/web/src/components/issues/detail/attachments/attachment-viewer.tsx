"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Download01Icon,
  File01Icon,
  LinkSquare02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { resolveDocumentSourceMeta } from "@/constants/document-source-meta";
import { useDocument } from "@/hooks/docs/use-documents";
import {
  attachmentDisplayName,
  downloadAttachment,
} from "@/lib/docs/attachment-preview";
import { estimateContentBytes, formatFileSize } from "@/lib/format/file-size";
import { cn } from "@/lib/utils";
import { EDocumentSource, type IDocument } from "@/types";

import { AttachmentPreviewPane } from "./attachment-preview-pane";

/** Modal attachment viewer — preview in-place + download + open in Docs. */
export function AttachmentViewer({
  workspaceSlug,
  documentId,
  initialDoc,
  open,
  onOpenChange,
}: {
  workspaceSlug: string;
  documentId: string | null;
  /** List row snapshot while the full document fetch resolves. */
  initialDoc?: IDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: fetched, isPending, isError } = useDocument(
    workspaceSlug,
    documentId ?? "",
  );

  const doc = fetched ?? (open ? initialDoc : null);
  const displayName = doc ? attachmentDisplayName(doc) : "";
  const size = doc ? formatFileSize(estimateContentBytes(doc.content)) : "";
  const sourceMeta = doc ? resolveDocumentSourceMeta(doc.source) : null;

  const handleDownload = () => {
    if (!doc) return;
    downloadAttachment(doc);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "t-attachment-viewer flex max-h-[min(92vh,880px)] max-w-3xl flex-col gap-0 overflow-hidden p-0",
          "sm:max-w-3xl",
        )}
        aria-describedby={doc ? "attachment-viewer-desc" : undefined}
      >
        <header className="flex shrink-0 items-start gap-3 border-b px-5 py-4 pr-12">
          <span
            className={cn(
              "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg",
              doc?.source === EDocumentSource.Agent
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <HugeiconsIcon icon={File01Icon} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold leading-snug">
              {displayName || "Attachment"}
            </DialogTitle>
            <DialogDescription id="attachment-viewer-desc" className="mt-1 flex flex-wrap items-center gap-2">
              {size ? <span className="tabular-nums">{size}</span> : null}
              {sourceMeta ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                    sourceMeta.badgeClass,
                  )}
                >
                  {doc?.source === EDocumentSource.Agent ? (
                    <HugeiconsIcon icon={SparklesIcon} className="size-2.5" />
                  ) : null}
                  {sourceMeta.label}
                </span>
              ) : null}
            </DialogDescription>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SkeletonReveal
            isLoading={isPending && !doc}
            className="min-h-[280px]"
            skeleton={<div className="m-4 min-h-[280px] rounded-lg bg-muted" />}
          >
            {isError && !doc ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                Couldn&apos;t load this attachment. Close and try again.
              </p>
            ) : doc ? (
              <AttachmentPreviewPane doc={doc} />
            ) : null}
          </SkeletonReveal>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-muted/20 px-5 py-3">
          {doc ? (
            <Button type="button" variant="outline" size="sm" className="active:scale-[0.97]" asChild>
              <Link
                href={`/${workspaceSlug}/docs/${doc.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
                Open in Docs
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="active:scale-[0.97]"
            disabled={!doc}
            onClick={handleDownload}
          >
            <HugeiconsIcon icon={Download01Icon} className="size-4" />
            Download
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
