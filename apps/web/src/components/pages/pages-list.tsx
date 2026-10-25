"use client";

import { useState } from "react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { usePages } from "@/hooks/docs/use-pages";

import { CreatePageDialog } from "./create-page-dialog";
import { PageActionsMenu } from "./page-actions-menu";

export function PagesList({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = usePages(workspaceSlug, projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const base = `/${workspaceSlug}/projects/${projectId}/pages`;

  if (isPending) {
    return (
      <SkeletonReveal
        isLoading
        className="m-6 min-h-48"
        skeleton={<div className="size-full rounded-lg border bg-muted" />}
      >
        <div />
      </SkeletonReveal>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load pages"
          description="Something went wrong."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="generic"
          title="No pages yet"
          description="Create wiki pages for runbooks, conventions, and project notes."
          actions={[{ label: "Create page", onClick: () => setCreateOpen(true) }]}
        />
        <CreatePageDialog
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">{items.length} pages</h2>
      <ul className="divide-y rounded-lg border">
        {items.map((page) => (
          <li key={page.id} className="flex items-center gap-1 pr-2 transition-colors hover:bg-accent/40">
            <Link
              href={`${base}/${page.id}`}
              className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3"
            >
              <span className="truncate font-medium">{page.title}</span>
              <span className="text-xs text-muted-foreground">
                Updated{" "}
                {new Date(page.updated_at).toLocaleDateString("en-US", { timeZone: "UTC" })}
              </span>
            </Link>
            <PageActionsMenu page={page} workspaceSlug={workspaceSlug} projectId={projectId} />
          </li>
        ))}
      </ul>
    </div>
  );
}
