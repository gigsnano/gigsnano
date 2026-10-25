"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon, Image01Icon } from "@hugeicons/core-free-icons";

import { DocBlockView, docBlockKey } from "@/components/docs/document-blocks";
import { splitDocBlocks } from "@/lib/docs/markdown";
import {
  attachmentPreviewKind,
  imagePreviewSrc,
  isPlaceholderUploadContent,
  pdfPreviewBlobUrl,
  type TAttachmentPreviewKind,
} from "@/lib/docs/attachment-preview";
import { cn } from "@/lib/utils";
import type { IDocument } from "@/types";

function UnsupportedPreview({
  kind,
  doc,
}: {
  kind: TAttachmentPreviewKind;
  doc: IDocument;
}) {
  const isBinaryPlaceholder =
    (kind === "image" || kind === "pdf") && isPlaceholderUploadContent(doc);

  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <HugeiconsIcon
          icon={kind === "image" ? Image01Icon : File01Icon}
          className="size-7"
        />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-foreground">
          {isBinaryPlaceholder ? "Preview not available" : "No preview for this file type"}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isBinaryPlaceholder
            ? "This file was registered without inline content. Use Download to save what’s stored, or re-upload when binary storage is enabled."
            : "Download the file to open it in the app that matches this format."}
        </p>
      </div>
    </div>
  );
}

/** In-modal preview body — image, markdown, text, PDF, or fallback. */
export function AttachmentPreviewPane({ doc }: { doc: IDocument }) {
  const kind = attachmentPreviewKind(doc);
  const imageSrc = kind === "image" ? imagePreviewSrc(doc) : null;
  // Derived during render (React Compiler memoizes it per doc/kind), so the
  // cleanup effect below only revokes the blob URL — no setState-in-effect.
  const pdfUrl = kind === "pdf" ? pdfPreviewBlobUrl(doc) : null;

  useEffect(() => {
    if (!pdfUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  if (kind === "image") {
    if (!imageSrc) return <UnsupportedPreview kind="image" doc={doc} />;
    return (
      <div className="flex min-h-[280px] items-center justify-center bg-muted/20 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded attachment preview */}
        <img
          src={imageSrc}
          alt={doc.file_name ?? doc.title}
          className="t-attachment-preview max-h-[min(60vh,520px)] max-w-full rounded-md object-contain shadow-sm"
        />
      </div>
    );
  }

  if (kind === "pdf") {
    if (!pdfUrl) return <UnsupportedPreview kind="pdf" doc={doc} />;
    return (
      <iframe
        title={doc.file_name ?? doc.title}
        src={pdfUrl}
        className="t-attachment-preview min-h-[min(60vh,520px)] w-full rounded-md border-0 bg-muted/10"
      />
    );
  }

  if (kind === "markdown") {
    return (
      <article
        className={cn(
          "t-attachment-preview gn-prose prose prose-sm dark:prose-invert max-w-none px-5 py-4",
          "min-h-[280px]",
        )}
      >
        {splitDocBlocks(doc.content).map((block, i) => (
          <DocBlockView key={docBlockKey(block, i)} block={block} />
        ))}
      </article>
    );
  }

  if (kind === "text" && doc.content?.trim()) {
    return (
      <pre className="t-attachment-preview min-h-[280px] overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-xs leading-relaxed text-foreground">
        {doc.content}
      </pre>
    );
  }

  return <UnsupportedPreview kind="unsupported" doc={doc} />;
}
