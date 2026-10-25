"use client";

import { IssueDetailView } from "../issue-detail-view";
import type { IStory } from "@/types";

/** Sheet-friendly wrapper around the shared issue detail layout. */
export function IssueDetailPanel({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  variant = "peek",
  onClose,
  onBack,
  onOpenStory,
  onOpenDocument,
  showProjectLink,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  variant?: "peek" | "page";
  onClose?: () => void;
  onBack?: () => void;
  onOpenStory?: (id: string) => void;
  onOpenDocument?: (docId: string) => void;
  showProjectLink?: boolean;
}) {
  return (
    <IssueDetailView
      story={story}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      cycleId={cycleId}
      variant={variant}
      onClose={onClose}
      onBack={onBack}
      onOpenStory={onOpenStory}
      onOpenDocument={onOpenDocument}
      showProjectLink={showProjectLink}
    />
  );
}
