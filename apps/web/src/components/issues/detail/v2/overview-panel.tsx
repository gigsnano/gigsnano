"use client";

import { useRef, useState } from "react";

import { CreateWorkItemModal } from "@/components/board";
import {
  AddExistingSubWorkDialog,
  CreateLinkDialog,
  CreateRelationDialog,
  IssueDescription,
  IssueDocuments,
} from "@/components/issues/detail";
import {
  EpicBreakDownButton,
  EpicBreakDownSheet,
} from "@/components/issues/detail/epic-break-down-sheet";
import { IssueTitleField } from "@/components/issues/detail/header/title-field";
import { useUpdateStory } from "@/hooks/story/use-stories";
import type { WorkItemTab } from "@/lib/issues/work-item-tabs";
import type { IStory } from "@/types";

import { ExecutionRow } from "./execution-row";
import { OverviewComments } from "./overview-comments";
import { RelationshipsRow } from "./relationships-row";

/** The spec's "show the full requirement by default"; collapse only past this. */
const DESCRIPTION_COLLAPSE_AT = 700;

/**
 * Overview tab (GIN-480, slice 2 of GIN-477).
 *
 * Answers the three questions in order — what needs doing (title, description),
 * who or what will do it (execution row), what happens next (relationships,
 * comments). Everything else moved to the tab that owns it: agent runs and
 * execution profile to Runs, code scope and delivery to Delivery, the audit
 * feed and time tracking to Activity.
 *
 * Acceptance criteria are NOT a separate block: there is no field for them, and
 * every work item already writes them as a task list inside the description.
 * A parallel field would fragment where criteria live for no gain — it belongs
 * with a data-model decision, not with a composition slice.
 */
export function OverviewPanel({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  onOpenStory,
  onOpenStoryPeek,
  onOpenDocument,
  onGoToTab,
  onOpenProperties,
  autoBreakDown = false,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  onOpenStory?: (id: string) => void;
  onOpenStoryPeek?: (id: string) => void;
  onOpenDocument?: (docId: string) => void;
  onGoToTab: (tab: WorkItemTab) => void;
  onOpenProperties: () => void;
  autoBreakDown?: boolean;
}) {
  const updateStory = useUpdateStory(workspaceSlug, projectId, cycleId);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);
  const [addExistingSubWorkOpen, setAddExistingSubWorkOpen] = useState(false);
  const [createSubWorkOpen, setCreateSubWorkOpen] = useState(false);
  const [breakDownOpen, setBreakDownOpen] = useState(autoBreakDown);

  // Deep-link from GigsAI `/break-down-epic`. Handled during render via a
  // prev-key check rather than an effect so it doesn't cost an extra commit.
  const breakDownKey = `${autoBreakDown} ${story.id}`;
  const [prevBreakDownKey, setPrevBreakDownKey] = useState(breakDownKey);
  if (breakDownKey !== prevBreakDownKey) {
    setPrevBreakDownKey(breakDownKey);
    if (autoBreakDown) setBreakDownOpen(true);
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleTitleChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) return;
    debounceRef.current = setTimeout(() => {
      updateStory.mutate({ storyId: story.id, patch: { title: trimmed } });
    }, 600);
  };

  return (
    <div key={story.id} className="space-y-6 px-6 py-6 sm:px-9">
      <IssueTitleField
        key={story.id}
        initialTitle={story.title}
        onTitleChange={handleTitleChange}
      />

      <IssueDescription
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        maxHeight={DESCRIPTION_COLLAPSE_AT}
      />

      <EpicBreakDownButton story={story} onOpen={() => setBreakDownOpen(true)} />

      <ExecutionRow
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onChange={onOpenProperties}
        onGoToTab={onGoToTab}
      />

      <RelationshipsRow
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onOpenStory={onOpenStoryPeek ?? onOpenStory}
        onCreateSubWork={() => setCreateSubWorkOpen(true)}
        onAddExistingSubWork={() => setAddExistingSubWorkOpen(true)}
        onAddLink={() => setLinkOpen(true)}
        onAddRelation={() => setRelationOpen(true)}
      />

      <IssueDocuments
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        variant="detail"
        uploadOpen={uploadOpen}
        onUploadOpenChange={setUploadOpen}
        onOpenDocument={onOpenDocument ? (doc) => onOpenDocument(doc.id) : undefined}
      />

      <OverviewComments
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        storyId={story.id}
        onGoToTab={onGoToTab}
      />

      <EpicBreakDownSheet
        open={breakDownOpen}
        onOpenChange={setBreakDownOpen}
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
      <CreateLinkDialog
        storyId={story.id}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={linkOpen}
        onOpenChange={setLinkOpen}
      />
      <CreateRelationDialog
        storyId={story.id}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        open={relationOpen}
        onOpenChange={setRelationOpen}
      />
      <AddExistingSubWorkDialog
        parentStory={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        open={addExistingSubWorkOpen}
        onOpenChange={setAddExistingSubWorkOpen}
      />
      <CreateWorkItemModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={story.cycle_id ?? cycleId}
        open={createSubWorkOpen}
        onOpenChange={setCreateSubWorkOpen}
        defaultParentId={story.id}
      />
    </div>
  );
}
