"use client";

import { IssueMarketplacePanel } from "@/components/marketplace/contracts/issue-marketplace-panel";
import { IssueProperties } from "@/components/issues/detail/properties/properties-section";
import { formatTimestamp } from "@/lib/format/timestamp";
import type { IStory } from "@/types";

/** Plane-style right properties rail (md+). */
export function IssueDetailSidebar({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  showProjectLink,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  showProjectLink?: boolean;
}) {
  return (
    <aside className="issue-detail-sidebar flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-border/60 bg-muted/20">
      <div className="shrink-0 border-b border-border/50 px-6 py-4">
        <h2 className="text-sm font-medium text-foreground">Properties</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Updated {formatTimestamp(story.updated_at)}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <IssueMarketplacePanel
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          storyId={story.id}
          defaultTitle={story.title}
          defaultDescription={story.description ?? ""}
        />
        <IssueProperties
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          showProjectLink={showProjectLink}
          variant="sidebar"
        />
      </div>
    </aside>
  );
}
