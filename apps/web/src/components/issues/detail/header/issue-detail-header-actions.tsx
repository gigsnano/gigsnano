"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { RunWithAgentButton } from "@/components/ai/delegation/run-with-agent-button";
import { PublishListingDialog } from "@/components/marketplace/listings/publish-listing-dialog";
import { Button } from "@/components/ui/button";
import { useIssueNavigation } from "@/hooks/issues/use-issue-navigation";
import { useProject } from "@/hooks/project/use-projects";
import { useStory } from "@/hooks/story/use-stories";
import { useWorkspaceAdmin } from "@/hooks/workspace/use-workspace-admin";
import { ECloneStatus } from "@/types";
import { EDelegationUnit } from "@/types/ai/agent-delegation";

import { IssueDetailQuickActions } from "./quick-actions";

/** AppHeader actions for the full-page work item detail route. */
export function IssueDetailHeaderActions({
  workspaceSlug,
  projectId,
  storyId,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
}) {
  const router = useRouter();
  const [publishOpen, setPublishOpen] = useState(false);
  const story = useStory(workspaceSlug, projectId, storyId);
  const project = useProject(workspaceSlug, projectId);
  const { isAdmin } = useWorkspaceAdmin(workspaceSlug);
  const navigation = useIssueNavigation(
    workspaceSlug,
    projectId,
    storyId,
    story.data?.cycle_id ?? undefined,
  );

  if (!story.data) return null;

  const hasRepo = project.data?.clone_status === ECloneStatus.Ready;

  const openStory = (id: string) => {
    router.push(`/${workspaceSlug}/projects/${projectId}/issues/${id}`);
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        {isAdmin ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs active:scale-[0.97]"
            onClick={() => setPublishOpen(true)}
          >
            Publish to marketplace
          </Button>
        ) : null}
        {!story.data.bmad ? (
          <RunWithAgentButton
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            storyId={storyId}
            unitType={EDelegationUnit.WorkItem}
            hasRepo={hasRepo}
          />
        ) : null}
        <IssueDetailQuickActions
          story={story.data}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={story.data.cycle_id ?? undefined}
          nav={
            navigation.hasNavigation
              ? {
                  position: navigation.position,
                  total: navigation.total,
                  prevId: navigation.prevId,
                  nextId: navigation.nextId,
                }
              : undefined
          }
          onNavigate={openStory}
        />
      </div>
      {isAdmin ? (
        <PublishListingDialog
          workspaceSlug={workspaceSlug}
          storyId={storyId}
          defaultTitle={story.data.title}
          defaultDescription={story.data.description ?? ""}
          open={publishOpen}
          onOpenChange={setPublishOpen}
        />
      ) : null}
    </>
  );
}
