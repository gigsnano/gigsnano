"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { useAddDocumentComment, useDocument, useResolveDocumentComment, useUpdateDocument } from "@/hooks/docs/use-documents";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { BMAD_AGENTS } from "@/constants/bmad-agents";
import { DocBlockView } from "@/components/docs/document-blocks";
import { splitDocBlocks } from "@/lib/docs/markdown";
import { canEditDocument } from "@/lib/issues/story-documents";
import { cn } from "@/lib/utils";

const ASSIGNEES = [
  "Ada Lovelace",
  "Alan Turing",
  ...BMAD_AGENTS.map((a) => a.name),
];

export function DocumentDetail({
  workspaceSlug,
  documentId,
}: {
  workspaceSlug: string;
  documentId: string;
}) {
  const { data: doc, isPending, isError, refetch } = useDocument(workspaceSlug, documentId);
  const addComment = useAddDocumentComment(workspaceSlug, documentId);
  const resolveComment = useResolveDocumentComment(workspaceSlug, documentId);
  const updateDoc = useUpdateDocument(workspaceSlug, documentId);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saved, setSaved] = useState(false);

  const blocks = doc ? splitDocBlocks(doc.content) : [];

  const isDirty =
    editing && doc && (editTitle !== doc.title || editContent !== doc.content);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const blockComments = (index: number) =>
    doc?.comments.filter((c) => c.block_index === index) ?? [];

  const onSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBlock === null || !commentBody.trim()) return;
    await addComment.mutateAsync({
      block_index: selectedBlock,
      body: commentBody.trim(),
      assignee: assignee || null,
    });
    setCommentBody("");
    setAssignee("");
    setSelectedBlock(null);
  };

  const startEdit = () => {
    if (!doc) return;
    setEditTitle(doc.title);
    setEditContent(doc.content);
    setEditing(true);
    setSaved(false);
  };

  const onSaveDoc = async () => {
    await updateDoc.mutateAsync({ title: editTitle.trim(), content: editContent });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (isPending) {
    return (
      <SkeletonReveal
        isLoading
        className="m-6 min-h-96"
        skeleton={<div className="size-full rounded-lg border bg-muted" />}
      >
        <div />
      </SkeletonReveal>
    );
  }

  if (isError || !doc) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Document not found"
          description="This planning artifact doesn't exist or was removed."
          actions={[
            { label: "Retry", onClick: () => refetch() },
            { label: "All documents", href: `/${workspaceSlug}/docs` },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl gap-6 p-6">
      <article className="min-w-0 flex-1">
        <div className="mb-6 border-b pb-4">
          <p className="text-xs text-muted-foreground">
            <Link href={`/${workspaceSlug}/docs`} className="hover:text-foreground">
              Docs
            </Link>
            {" · "}
            <Link
              href={`/${workspaceSlug}/projects/${doc.project_id}`}
              className="hover:text-foreground"
            >
              {doc.project_name}
            </Link>
          </p>
          <h1 className="mt-2 text-xl font-semibold">{doc.title}</h1>
          {doc.workflow ? (
            <p className="mt-1 font-mono text-xs text-muted-foreground">{doc.workflow}</p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="active:scale-[0.97]" disabled={updateDoc.isPending} onClick={onSaveDoc}>
                  {updateDoc.isPending ? "Saving…" : "Save"}
                </Button>
              </>
            ) : canEditDocument(doc) ? (
              <Button size="sm" variant="outline" className="active:scale-[0.97]" onClick={startEdit}>
                Edit document
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Read-only · generated by AI</span>
            )}
          </div>
          {!editing ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Select a block to comment or assign to a teammate or AI agent.
            </p>
          ) : null}
        </div>

        {editing ? (
          <div className="space-y-3">
            <input
              aria-label="Document title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
            <textarea
              aria-label="Document content"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={20}
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
            />
          </div>
        ) : (
        <div className="space-y-1">
          {blocks.map((block, i) => {
            const comments = blockComments(i);
            const selected = selectedBlock === i;
            return (
              <div key={i} className="space-y-2">
                <button
                  type="button"
                  aria-label={`Select block ${i + 1} for commenting`}
                  onClick={() => setSelectedBlock(selected ? null : i)}
                  className={cn(
                    "w-full scroll-mt-4 rounded-md px-3 py-1.5 text-left text-sm leading-relaxed transition-colors duration-150 ease-out",
                    selected
                      ? "bg-primary/5 ring-1 ring-primary"
                      : comments.length > 0
                        ? "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-400/10 dark:hover:bg-amber-400/15"
                        : "hover:bg-muted/50",
                  )}
                >
                  <DocBlockView block={block} />
                </button>
                {comments.length > 0 ? (
                  <ul className="ml-2 space-y-1.5 border-l-2 border-muted pl-3">
                    {comments.map((c) => (
                      <li key={c.id} className="text-xs">
                        <span className="font-medium">{c.author_name}</span>
                        {c.assignee ? (
                          <span className="text-muted-foreground"> → {c.assignee}</span>
                        ) : null}
                        {c.resolved ? (
                          <span className="ml-1 text-emerald-600">(resolved)</span>
                        ) : null}
                        <p className="mt-0.5 text-muted-foreground">{c.body}</p>
                        {!c.resolved ? (
                          <button
                            type="button"
                            className="mt-1 text-[10px] font-medium text-primary hover:underline"
                            onClick={() =>
                              resolveComment.mutate({ commentId: c.id, resolved: true })
                            }
                          >
                            Mark resolved
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
        )}
      </article>

      <aside className="w-72 shrink-0">
        <div className="sticky top-4 rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Review comment</h2>
          {selectedBlock === null ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Click a content block to add a comment.
            </p>
          ) : (
            <form onSubmit={onSubmitComment} className="mt-3 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Block {selectedBlock + 1} of {blocks.length}
              </p>
              <textarea
                aria-label="Comment"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="What should change?"
                rows={3}
                className="resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <label className="flex flex-col gap-1 text-xs font-medium">
                Assign to
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {ASSIGNEES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="submit"
                size="sm"
                disabled={!commentBody.trim() || addComment.isPending}
                className="transition-transform duration-150 ease-out active:scale-[0.97]"
              >
                {addComment.isPending ? "Saving…" : "Add comment"}
              </Button>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}
