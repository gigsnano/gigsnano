"use client";

import { useState } from "react";
import Link from "next/link";

import { useDocuments } from "@/hooks/docs/use-documents";
import { useDrafts, useDeleteDraft } from "@/hooks/story/use-drafts";
import { useProjects } from "@/hooks/project/use-projects";
import { CreateWorkItemModal } from "@/components/board/story/create-work-item-modal";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import type { IWorkItemDraftRecord } from "@/types";

function WorkItemDraftsSection({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useDrafts(workspaceSlug);
  const { data: projects } = useProjects(workspaceSlug);
  const deleteDraft = useDeleteDraft(workspaceSlug);
  const [resume, setResume] = useState<IWorkItemDraftRecord | null>(null);

  const drafts = data ?? [];
  const projectName = (projectId: string) =>
    projects?.find((p) => p.id === projectId)?.name ?? "Project";

  return (
    <section className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Work items</h2>
        {drafts.length > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {drafts.length}
          </span>
        ) : null}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonReveal
              key={i}
              isLoading
              className="h-14"
              skeleton={<div className="size-full rounded-lg border bg-card" />}
            >
              <div />
            </SkeletonReveal>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          assetKey="error"
          title="Couldn't load drafts"
          description="Something went wrong fetching work-item drafts."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      ) : drafts.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No work-item drafts"
          description="Unsaved work items you choose to keep will show up here so you can resume them later."
        />
      ) : (
        <ul className="divide-y">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex items-center justify-between py-3 first:pt-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{draft.title || "Untitled"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {projectName(draft.project_id)} · Updated{" "}
                  {/* Explicit locale/timeZone — deterministic across server + client render (no hydration mismatch). */}
                  {new Date(draft.updated_at).toLocaleDateString("en-US", { timeZone: "UTC" })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={`Resume draft ${draft.title || "Untitled"}`}
                  onClick={() => setResume(draft)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Resume
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete draft ${draft.title || "Untitled"}`}
                  disabled={deleteDraft.isPending}
                  onClick={() => deleteDraft.mutate(draft.id)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {resume ? (
        <CreateWorkItemModal
          workspaceSlug={workspaceSlug}
          projectId={resume.project_id}
          resumeDraft={resume}
          open
          onOpenChange={(o) => {
            if (!o) setResume(null);
          }}
        />
      ) : null}
    </section>
  );
}

function DocumentDraftsSection({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useDocuments(workspaceSlug);

  const drafts = (data ?? []).filter((d) => d.is_draft);

  return (
    <section className="flex flex-col gap-3 border-t p-6">
      <h2 className="text-sm font-semibold">Documents</h2>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonReveal
              key={i}
              isLoading
              className="h-14"
              skeleton={<div className="size-full rounded-lg border bg-card" />}
            >
              <div />
            </SkeletonReveal>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          assetKey="error"
          title="Couldn't load drafts"
          description="Something went wrong fetching draft documents."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      ) : drafts.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No drafts"
          description="Documents you save as drafts will show up here before publishing."
          actions={[{ label: "Browse docs", href: `/${workspaceSlug}/docs` }]}
        />
      ) : (
        <ul className="divide-y">
          {drafts.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between py-3 first:pt-0">
              <div className="min-w-0">
                <Link
                  href={`/${workspaceSlug}/docs/${doc.id}`}
                  className="text-sm font-medium hover:text-primary"
                >
                  {doc.title}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {doc.project_name} · Draft
                </p>
              </div>
              <Link
                href={`/${workspaceSlug}/docs/${doc.id}`}
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                Continue editing
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DraftsList({ workspaceSlug }: { workspaceSlug: string }) {
  // Both sections render in one step: whichever query settled first used to
  // grow (empty state vs. skeleton) and push the other section down.
  const workItems = useDrafts(workspaceSlug);
  const documents = useDocuments(workspaceSlug);
  if (workItems.isPending || documents.isPending) {
    return (
      <div className="flex flex-col gap-2 p-6" aria-busy>
        {["a", "b", "c", "d"].map((k) => (
          <SkeletonReveal
            key={k}
            isLoading
            className="h-14"
            skeleton={<div className="size-full rounded-lg border bg-card" />}
          >
            <div />
          </SkeletonReveal>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <WorkItemDraftsSection workspaceSlug={workspaceSlug} />
      <DocumentDraftsSection workspaceSlug={workspaceSlug} />
    </div>
  );
}
