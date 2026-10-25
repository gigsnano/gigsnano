"use client";

import { useState } from "react";

import {
  IssueActivity,
  IssueAgentRuns,
  IssueCodeScope,
  IssueDelivery,
  IssueDocuments,
  IssueExecutionProfile,
  IssueStaffThis,
  IssueTimeTracking,
} from "@/components/issues/detail";
import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { useDelivery } from "@/hooks/codebase/use-delivery";
import { useProject } from "@/hooks/project/use-projects";
import { supportsCodeDelivery } from "@/lib/issues/delivery-summary";
import { EStoryType, type IStory } from "@/types";

const PANEL = "space-y-6 px-6 py-6 sm:px-9";

/**
 * Interim homes for the widgets Overview no longer carries (GIN-480).
 *
 * Pruning Overview only works if the pruned surfaces land somewhere, so each
 * moves to the tab that will own it. These are compositions of the existing
 * widgets, not designs — GIN-482/483/484 redesign them in place.
 */

export function RunsPanel({
  story,
  workspaceSlug,
  projectId,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <div className={PANEL}>
      <IssueAgentRuns
        storyId={story.id}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        assignedPersonaId={story.ai_agent_id ?? null}
      />

      {/* Collapsed by default, and the only place "Execution Profile" is named.
          Skills, model, policy and gates are things you set once and then stop
          thinking about — they do not belong in front of someone watching a run. */}
      <IssueCollapsibleSection title="Advanced settings" defaultOpen={false}>
        <div className="space-y-6 pt-1">
          <IssueExecutionProfile
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
          />
          {/* Marketplace staffing sits here until GIN-481 gives it a home in the
              assignment drawer, which is where the spec wants it. */}
          <IssueStaffThis
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            storyTitle={story.title}
            storyDescription={story.description ?? ""}
          />
        </div>
      </IssueCollapsibleSection>
    </div>
  );
}

export function DeliveryPanel({
  story,
  workspaceSlug,
  projectId,
  onOpenDocument,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  onOpenDocument?: (docId: string) => void;
}) {
  const isPlanningLevel = story.type === EStoryType.Epic || story.type === EStoryType.Feature;
  const { data: project } = useProject(workspaceSlug, projectId);
  const { data: bundle } = useDelivery(workspaceSlug, projectId, story.id);
  const [uploadOpen, setUploadOpen] = useState(false);

  const code = supportsCodeDelivery({
    cloneStatus: project?.clone_status,
    hasBundle: Boolean(bundle),
  });

  return (
    <div className={PANEL}>
      {code ? (
        <>
          <IssueCodeScope
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            defaultOpen={!isPlanningLevel}
          />
          <IssueDelivery
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            defaultOpen={!isPlanningLevel}
          />
        </>
      ) : (
        <>
          {/* No repository on the project, so there is no branch to cut. Offering
              "coordinate branches across your Write repositories" to someone
              tracking a design review or an ops task is an empty gesture — these
              items deliver documents and evidence instead (GIN-483). */}
          <p className="text-sm text-muted-foreground">
            This project has no connected repository, so delivery here is the evidence you
            attach — documents, designs, exports, links.
          </p>
          {/* Deliverables only on this path. On a code item the same files
              already render as Attachments on Overview, and one list under two
              names in two places is a worse answer than one list in one. */}
          <IssueDocuments
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            variant="detail"
            uploadOpen={uploadOpen}
            onUploadOpenChange={setUploadOpen}
            onOpenDocument={onOpenDocument ? (doc) => onOpenDocument(doc.id) : undefined}
          />
        </>
      )}
    </div>
  );
}

export function ActivityPanel({
  story,
  workspaceSlug,
  projectId,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <div className={PANEL}>
      <IssueTimeTracking
        storyId={story.id}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
      <IssueActivity workspaceSlug={workspaceSlug} projectId={projectId} storyId={story.id} />
    </div>
  );
}
