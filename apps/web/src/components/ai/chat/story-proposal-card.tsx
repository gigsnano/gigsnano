"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateWorkItemModal } from "@/components/board/story/create-work-item-modal";
import { useCreateStory } from "@/hooks/story/use-stories";
import { renderSimpleMarkdown } from "@/lib/docs/markdown";
import { STORY_TYPE_META } from "@/constants/story-meta";
import { EStoryPriority, EStoryStatus } from "@/types";
import { cn } from "@/lib/utils";
import type { IStoryProposal } from "@/lib/chat/story-proposal";
import { useStoryProposalTarget } from "./story-proposal-context";

/**
 * Renders an AI-proposed work item (parsed from a `gigs:story` block) as a
 * card with Edit/Create actions. Read-only (no actions) when no project is
 * in scope — see `useStoryProposalTarget`.
 */
export function StoryProposalCard({ proposal }: { proposal: IStoryProposal }) {
  const target = useStoryProposalTarget();
  const [editOpen, setEditOpen] = useState(false);
  const workspaceSlug = target?.workspaceSlug ?? "";
  const projectId = target?.projectId ?? "";
  const canCreate = Boolean(target?.projectId);
  const create = useCreateStory(workspaceSlug, projectId);
  const typeMeta = STORY_TYPE_META[proposal.type];
  // The proposal description is markdown/plain text, but the story description
  // is an HTML field (RichEditor). Convert so it renders formatted, not raw.
  const descriptionHtml = proposal.description ? renderSimpleMarkdown(proposal.description) : "";

  const onCreate = () => {
    if (!canCreate) return;
    create.mutate({
      title: proposal.title,
      type: proposal.type,
      description: descriptionHtml,
      status: EStoryStatus.Todo,
      priority: EStoryPriority.None,
      assignee_id: null,
      label_ids: [],
      start_date: null,
      target_date: null,
      cycle_id: null,
      module_id: null,
      estimate_id: null,
      estimate_points: null,
      parent_id: null,
    });
  };

  return (
    <div className="mt-2 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{proposal.title}</span>
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-medium",
            typeMeta.chip,
          )}
        >
          {typeMeta.label}
        </span>
      </div>
      {proposal.description ? (
        <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">
          {proposal.description}
        </p>
      ) : null}

      {!canCreate ? (
        <p className="mt-2 text-xs text-muted-foreground">Open a project to create this.</p>
      ) : (
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Edit proposed work item: ${proposal.title}`}
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={create.isPending || create.isSuccess}
            aria-label={`Create work item: ${proposal.title}`}
            onClick={onCreate}
          >
            {create.isSuccess ? "Created ✓" : create.isPending ? "Creating…" : "Create"}
          </Button>
          {create.isError ? (
            <span className="text-xs text-destructive">Failed to create — try again.</span>
          ) : null}
        </div>
      )}

      {canCreate ? (
        <CreateWorkItemModal
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          open={editOpen}
          onOpenChange={setEditOpen}
          initialDraft={{
            title: proposal.title,
            type: proposal.type,
            description: descriptionHtml,
          }}
        />
      ) : null}
    </div>
  );
}
