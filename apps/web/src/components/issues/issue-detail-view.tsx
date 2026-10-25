"use client";

import { useEffect, useRef, useState } from "react";

import { CreateWorkItemModal } from "@/components/board";
import {
  AddExistingSubWorkDialog,
  CreateLinkDialog,
  CreateRelationDialog,
  IssueActivity,
  IssueDescription,
  IssueDetailToolbar,
  IssueAgentRuns,
  IssueCodeScope,
  IssueDelivery,
  IssueExecutionProfile,
  IssueDocuments,
  IssueImpact,
  IssueLinks,
  IssueStaffThis,
  IssueProperties,
  IssuePropertyRow,
  IssueRelations,
  IssueTimeTracking,
  IssueWidgetActions,
} from "@/components/issues/detail";
import { EpicBreakDownButton, EpicBreakDownSheet } from "@/components/issues/detail/epic-break-down-sheet";
import { IssueDetailSidebar } from "@/components/issues/detail/layout/issue-detail-sidebar";
import { IssueTitleField } from "@/components/issues/detail/header/title-field";
import { StoryCode } from "@/components/issues/shared/story-code";
import { useIssueNavigation, type IIssueNavigation } from "@/hooks/issues/use-issue-navigation";
import { useProject } from "@/hooks/project/use-projects";
import { useStoryLinks, useStoryRelations } from "@/hooks/story/use-story-detail";
import { useUpdateStory } from "@/hooks/story/use-stories";
import { storyCode } from "@/lib/issues/issue-routes";
import { cn } from "@/lib/utils";
import { EStoryType, type IStory } from "@/types";

export function IssueDetailView({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  variant = "page",
  onClose,
  onBack,
  onOpenStory,
  onOpenStoryPeek,
  onOpenDocument,
  showProjectLink = false,
  navigation: navigationProp,
  autoBreakDown = false,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  /**
   * `embedded` is the GIN-479 shell's Overview panel: the same composition with
   * no chrome of its own — the shell already owns the header, the scroll region
   * and the properties drawer.
   */
  variant?: "peek" | "page" | "embedded";
  onClose?: () => void;
  /** Return to the previous peeked item (Jira-style "‹ Back"); absent at trail root. */
  onBack?: () => void;
  onOpenStory?: (id: string) => void;
  /** Opens a nested peek sheet (Plane-style) without leaving the current page. */
  onOpenStoryPeek?: (id: string) => void;
  onOpenDocument?: (docId: string) => void;
  showProjectLink?: boolean;
  navigation?: IIssueNavigation;
  /** Deep-link from GigsAI `/break-down-epic` — auto-opens the break-down sheet. */
  autoBreakDown?: boolean;
}) {
  const project = useProject(workspaceSlug, projectId);
  const updateStory = useUpdateStory(workspaceSlug, projectId, cycleId);
  const { data: links } = useStoryLinks(workspaceSlug, projectId, story.id);
  const { data: relations } = useStoryRelations(workspaceSlug, projectId, story.id);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [relationOpen, setRelationOpen] = useState(false);
  const [addExistingSubWorkOpen, setAddExistingSubWorkOpen] = useState(false);
  const [createSubWorkOpen, setCreateSubWorkOpen] = useState(false);
  const [breakDownOpen, setBreakDownOpen] = useState(autoBreakDown);

  // Open the break-down dialog when the deep-link flag is set (or the story
  // changes). Handled during render via a prev-key check rather than an effect
  // so it doesn't cost an extra commit.
  const breakDownKey = `${autoBreakDown} ${story.id}`;
  const [prevBreakDownKey, setPrevBreakDownKey] = useState(breakDownKey);
  if (breakDownKey !== prevBreakDownKey) {
    setPrevBreakDownKey(breakDownKey);
    if (autoBreakDown) setBreakDownOpen(true);
  }

  const identifier = project.data?.identifier ?? "—";
  const key = storyCode(identifier, story);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleTitleChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (!trimmed) return;
    debounceRef.current = setTimeout(() => {
      updateStory.mutate({ storyId: story.id, patch: { title: trimmed } });
    }, 600);
  };

  const isPeek = variant === "peek";
  const isEmbedded = variant === "embedded";
  const scrollRef = useRef<HTMLDivElement>(null);

  const internalNavigation = useIssueNavigation(workspaceSlug, projectId, story.id, cycleId);
  const navigation = navigationProp ?? internalNavigation;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [story.id]);

  useEffect(() => {
    if (!navigation.hasNavigation || !onOpenStory) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("[contenteditable='true']") ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      const prev = e.key === "k" || e.key === "ArrowUp";
      const next = e.key === "j" || e.key === "ArrowDown";
      if (!prev && !next) return;

      e.preventDefault();
      if (prev && navigation.prevId) onOpenStory(navigation.prevId);
      if (next && navigation.nextId) onOpenStory(navigation.nextId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigation.hasNavigation, navigation.prevId, navigation.nextId, onOpenStory]);

  const mainContent = (
    <div key={story.id} className="space-y-6">
      <div>
        <StoryCode code={key} />
        <IssueTitleField
          key={story.id}
          initialTitle={story.title}
          onTitleChange={handleTitleChange}
        />
      </div>

      <IssuePropertyRow
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
      />

      <div className="flex flex-wrap items-center gap-2">
        <EpicBreakDownButton story={story} onOpen={() => setBreakDownOpen(true)} />
      </div>

      <IssueDescription
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
      />

      <IssueWidgetActions
        onAttach={() => setUploadOpen(true)}
        onCreateSubWork={() => setCreateSubWorkOpen(true)}
        onAddExistingSubWork={() => setAddExistingSubWorkOpen(true)}
        onAddLink={() => setLinkOpen(true)}
        onAddRelation={() => setRelationOpen(true)}
      />

      <div className="space-y-6">
        <IssueDocuments
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          variant={isPeek ? "peek" : "detail"}
          uploadOpen={uploadOpen}
          onUploadOpenChange={setUploadOpen}
          onOpenDocument={onOpenDocument ? (doc) => onOpenDocument(doc.id) : undefined}
        />

        {(links?.length ?? 0) > 0 ? (
          <IssueLinks
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onAdd={() => setLinkOpen(true)}
          />
        ) : null}

        {(relations?.length ?? 0) > 0 ? (
          <IssueRelations
            storyId={story.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            onOpenStory={onOpenStory}
            onAdd={() => setRelationOpen(true)}
          />
        ) : null}

        <IssueImpact
          storyId={story.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          onOpenStory={onOpenStoryPeek ?? onOpenStory}
        />

        <IssueCodeScope
          storyId={story.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          defaultOpen={story.type !== EStoryType.Epic && story.type !== EStoryType.Feature}
        />

        <IssueDelivery
          storyId={story.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          defaultOpen={story.type !== EStoryType.Epic && story.type !== EStoryType.Feature}
        />

        <IssueExecutionProfile
          storyId={story.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
        />

        <IssueAgentRuns
          storyId={story.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          assignedPersonaId={story.ai_agent_id ?? null}
        />

        <IssueStaffThis
          storyId={story.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          storyTitle={story.title}
          storyDescription={story.description ?? ""}
        />

        <IssueTimeTracking
          storyId={story.id}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
        />

        {/* The v2 shell owns Properties at every breakpoint (inline drawer on
            desktop, sheet below xl), so `embedded` renders it nowhere here. */}
        {isEmbedded ? null : !isPeek ? (
          <div className="md:hidden">
            <IssueProperties
              story={story}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              cycleId={cycleId}
              showProjectLink={showProjectLink}
            />
          </div>
        ) : (
          <IssueProperties
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
            showProjectLink={showProjectLink}
          />
        )}
      </div>

      <IssueActivity
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        storyId={story.id}
      />
    </div>
  );

  const dialogs = (
    <>
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
    </>
  );

  if (isEmbedded) {
    return (
      <div className="px-6 py-6 sm:px-9">
        {mainContent}
        {dialogs}
      </div>
    );
  }

  if (isPeek) {
    return (
      <div
        ref={scrollRef}
        className="flex h-full min-h-0 flex-col overflow-y-auto px-8 py-6"
      >
        <IssueDetailToolbar
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          variant="peek"
          onClose={onClose}
          onBack={onBack}
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
          onNavigate={onOpenStory}
        />
        {mainContent}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="issue-detail-root flex h-full min-h-0 w-full overflow-hidden">
      <div
        ref={scrollRef}
        className="issue-detail-main min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-9"
      >
        {mainContent}
        {dialogs}
      </div>
      <div className="hidden shrink-0 md:flex md:w-80 lg:min-w-80 xl:min-w-96">
        <IssueDetailSidebar
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          showProjectLink={showProjectLink}
        />
      </div>
    </div>
  );
}
