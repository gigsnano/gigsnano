"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  Download01Icon,
  File01Icon,
  MoreHorizontalIcon,
  SparklesIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  ExpectedArtifactHint,
  IssueDocumentsEmpty,
} from "@/components/issues/detail/widgets/documents-empty";
import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveDocumentSourceMeta } from "@/constants/document-source-meta";
import { useDeleteDocument, useStoryDocuments } from "@/hooks/docs/use-documents";
import {
  attachmentDisplayName,
  attachmentPreviewKind,
  downloadAttachment,
  imagePreviewSrc,
} from "@/lib/docs/attachment-preview";
import { estimateContentBytes, formatFileSize } from "@/lib/format/file-size";
import { canDeleteDocument, messageForDeleteFailure } from "@/lib/issues/story-documents";
import { cn } from "@/lib/utils";
import { EDocumentSource, type IDocument, type IStory } from "@/types";

import { AttachmentViewer } from "@/components/issues/detail/attachments/attachment-viewer";
import { UploadStoryDocumentDialog } from "@/components/issues/detail/dialogs/upload-document-dialog";

function SourceBadge({ source }: { source: EDocumentSource }) {
  const meta = resolveDocumentSourceMeta(source);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              meta.badgeClass,
            )}
            aria-label={meta.hint}
          >
            {source === EDocumentSource.Agent ? (
              <HugeiconsIcon icon={SparklesIcon} className="size-2.5" />
            ) : null}
            {meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent>{meta.hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AttachmentRow({
  doc,
  onView,
  onDownload,
  onDelete,
}: {
  doc: IDocument;
  onView: (doc: IDocument) => void;
  onDownload: (doc: IDocument) => void;
  onDelete: (doc: IDocument) => void;
}) {
  const isAgent = doc.source === EDocumentSource.Agent;
  const displayName = attachmentDisplayName(doc);
  const size = formatFileSize(estimateContentBytes(doc.content));
  const thumbSrc =
    attachmentPreviewKind(doc) === "image" ? imagePreviewSrc(doc) : null;

  return (
    <div className="group t-doc-row flex items-center gap-1 rounded-md px-1 py-1.5 transition-[background-color] duration-150 ease-out hover:bg-accent/50">
      <button
        type="button"
        onClick={() => onView(doc)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]"
      >
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element, react-doctor/nextjs-no-img-element -- base64 data-URL thumbnail already in memory; next/image can't optimize it
          <img
            src={thumbSrc}
            alt=""
            className="size-7 shrink-0 rounded object-cover"
          />
        ) : (
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded",
              isAgent
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <HugeiconsIcon icon={File01Icon} className="size-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{displayName}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{size}</span>
            <SourceBadge source={doc.source} />
          </span>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity duration-150 ease-out md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`View ${displayName}`}
          className="size-7 active:scale-[0.97]"
          onClick={() => onView(doc)}
        >
          <HugeiconsIcon icon={ViewIcon} className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Download ${displayName}`}
          className="size-7 active:scale-[0.97]"
          onClick={() => onDownload(doc)}
        >
          <HugeiconsIcon icon={Download01Icon} className="size-3.5" />
        </Button>

        {canDeleteDocument(doc) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Document actions"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97]"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(doc)}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}

export function IssueDocuments({
  story,
  workspaceSlug,
  projectId,
  onOpenDocument,
  variant = "detail",
  uploadOpen: controlledUploadOpen,
  onUploadOpenChange,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  onOpenDocument?: (doc: IDocument) => void;
  variant?: "detail" | "peek";
  uploadOpen?: boolean;
  onUploadOpenChange?: (open: boolean) => void;
}) {
  const { data: docs, isPending, isError, refetch } = useStoryDocuments(
    workspaceSlug,
    projectId,
    story.id,
  );
  const deleteDoc = useDeleteDocument(workspaceSlug, projectId, story.id);
  const [internalUploadOpen, setInternalUploadOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IDocument | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<IDocument | null>(null);

  const uploadOpen = controlledUploadOpen ?? internalUploadOpen;
  const setUploadOpen = onUploadOpenChange ?? setInternalUploadOpen;

  const artifact = story.bmad?.artifact;
  const isPeek = variant === "peek";
  const count = docs?.length ?? 0;

  const handleView = (doc: IDocument) => {
    if (onOpenDocument) {
      onOpenDocument(doc);
      return;
    }
    setViewingDoc(doc);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteDoc.mutateAsync(pendingDelete.id);
      setPendingDelete(null);
    } catch (error) {
      // The app has no toast infrastructure, so failures are reported inline in
      // the dialog — which also keeps the retry next to the thing that failed.
      setDeleteError(messageForDeleteFailure(error));
    }
  };

  const uploadAction = !isError ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Upload attachment"
      className="size-7 active:scale-[0.97]"
      onClick={() => setUploadOpen(true)}
    >
      <HugeiconsIcon icon={Add01Icon} className="size-4" />
    </Button>
  ) : null;

  return (
    <>
      <IssueCollapsibleSection
        title="Attachments"
        count={count}
        defaultOpen={count > 0 || isPeek}
        action={uploadAction}
      >
        <SkeletonReveal
          isLoading={isPending}
          className="min-h-[2.75rem]"
          skeleton={
            <div className={cn("rounded-md bg-muted", isPeek ? "h-[4.5rem]" : "h-10")} />
          }
        >
          {isError ? (
            <EmptyState
              assetKey="error"
              align="start"
              className="rounded-lg border px-4 py-6"
              title="Couldn't load attachments"
              description="Something went wrong fetching files for this work item."
              actions={[{ label: "Retry", onClick: () => refetch() }]}
            />
          ) : !docs?.length ? (
            <>
              <IssueDocumentsEmpty
                variant={isPeek ? "peek" : "detail"}
                artifact={artifact}
                onUpload={() => setUploadOpen(true)}
              />
              {artifact && isPeek ? <ExpectedArtifactHint artifact={artifact} /> : null}
            </>
          ) : (
            <div className="flex flex-col" aria-live="polite">
              {docs.map((doc) => (
                <AttachmentRow
                  key={doc.id}
                  doc={doc}
                  onView={handleView}
                  onDownload={downloadAttachment}
                  onDelete={setPendingDelete}
                />
              ))}
            </div>
          )}
        </SkeletonReveal>
      </IssueCollapsibleSection>

      <AttachmentViewer
        workspaceSlug={workspaceSlug}
        documentId={viewingDoc?.id ?? null}
        initialDoc={viewingDoc}
        open={Boolean(viewingDoc)}
        onOpenChange={(open) => {
          if (!open) setViewingDoc(null);
        }}
      />

      <UploadStoryDocumentDialog
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => {
          if (!o) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogTitle>Delete attachment?</DialogTitle>
          <DialogDescription>
            {pendingDelete?.title} will be removed from this work item. This cannot be undone.
          </DialogDescription>
          {deleteError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteDoc.isPending}
              onClick={() => void confirmDelete()}
            >
              {deleteDoc.isPending ? "Deleting…" : deleteError ? "Try again" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
