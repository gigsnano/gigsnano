"use client";

import { useState } from "react";

import { CycleActionsMenu } from "@/components/cycles/cycle-actions-menu";
import { PublishListingDialog } from "@/components/marketplace/listings/publish-listing-dialog";
import { Button } from "@/components/ui/button";
import { IssuesToolbarControls } from "@/components/issues/toolbar/issues-toolbar-controls";
import { useCycle } from "@/hooks/project/use-cycles";
import { useWorkspaceAdmin } from "@/hooks/workspace/use-workspace-admin";

/**
 * Cycle detail secondary-nav toolbar (rendered into AppHeader's actions).
 *
 * Shares `IssuesToolbarControls` with /issues, so filters, grouping, the layout
 * switcher and the item count behave identically on both. Only Publish and the
 * cycle menu are this page's own. The cycle name lives in the breadcrumb.
 */
export function CycleDetailToolbar({
  workspaceSlug,
  projectId,
  cycleId,
}: {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
}) {
  const cycle = useCycle(workspaceSlug, projectId, cycleId);
  const { isAdmin } = useWorkspaceAdmin(workspaceSlug);
  const [publishOpen, setPublishOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <IssuesToolbarControls
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
        />

        {isAdmin ? (
          <Button
            variant="outline"
            size="sm"
            className="hidden @min-[46rem]/hdr:inline-flex"
            onClick={() => setPublishOpen(true)}
          >
            Publish cycle
          </Button>
        ) : null}

        {cycle.data ? (
          <CycleActionsMenu
            cycle={cycle.data}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
          />
        ) : null}
      </div>

      {isAdmin ? (
        <PublishListingDialog
          workspaceSlug={workspaceSlug}
          cycleId={cycleId}
          defaultTitle={cycle.data?.name ?? "Cycle work"}
          defaultDescription={cycle.data?.description ?? ""}
          open={publishOpen}
          onOpenChange={setPublishOpen}
        />
      ) : null}
    </>
  );
}
