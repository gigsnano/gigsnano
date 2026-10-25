"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowShrink01Icon, ArrowExpand01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useAuthUser } from "@/hooks/auth/use-auth";
import { useMembers } from "@/hooks/workspace/use-members";
import { useProjectLabels, useProjectEstimates, useProjectStateLabels } from "@/hooks/project/use-project-settings";
import { useMoveStory } from "@/hooks/story/use-stories";
import { buildAssigneeMap } from "@/lib/issues/story-assignees";
import { peekHref } from "@/lib/issues/issue-routes";
import { getBmadLockMessage } from "@/lib/bmad/bmad-unlock";
import { cn } from "@/lib/utils";
import { EStoryStatus, type IDocument, type IStory } from "@/types";

import { BoardAssigneeFilter, type EAssigneeFilter } from "@/components/board/filters/board-assignee-filter";
import { BoardLabelFilter } from "@/components/board/filters/board-label-filter";
import { StoryCard } from "@/components/board/kanban/story-card";
import { WorkItemKanbanCard } from "@/components/issues/kanban/work-item-kanban-card";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { StoryPanel } from "@/components/board/story/story-panel";

const DEFAULT_COLUMNS: { status: EStoryStatus; label: string }[] = [
  { status: EStoryStatus.Todo, label: "To do" },
  { status: EStoryStatus.InProgress, label: "In progress" },
  { status: EStoryStatus.InReview, label: "In review" },
  { status: EStoryStatus.Done, label: "Done" },
];

export function KanbanBoard(props: KanbanBoardProps) {
  return (
    <Suspense
      fallback={
        <div className="flex gap-(--kanban-gap) p-(--kanban-pad-x)">
          {DEFAULT_COLUMNS.map((col) => (
            <div
              key={col.status}
              className="h-48 w-(--kanban-column-w) shrink-0 animate-pulse rounded-lg bg-layer-1"
            />
          ))}
        </div>
      }
    >
      <KanbanBoardInner {...props} />
    </Suspense>
  );
}

type KanbanBoardProps = {
  stories: IStory[];
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: { label: string; href?: string; onClick?: () => void };
  enableAgentChat?: boolean;
  enableDragDrop?: boolean;
  initialOpenStoryId?: string | null;
  showAssigneeFilter?: boolean;
  /** When `"work-item"`, renders Plane-style cards (issue key, property chips). */
  cardVariant?: "sprint" | "work-item";
  projectIdentifier?: string;
  /** Contractor contract route — scoped docs/stories for BMAD @-mentions. */
  projectDocuments?: IDocument[];
  scopedStories?: IStory[];
};

function KanbanBoardInner({
  stories,
  isPending,
  isError,
  refetch,
  workspaceSlug,
  projectId,
  cycleId,
  emptyTitle,
  emptyDescription,
  emptyAction,
  enableAgentChat = false,
  enableDragDrop = true,
  initialOpenStoryId = null,
  showAssigneeFilter = true,
  cardVariant = "sprint",
  projectIdentifier = "",
  projectDocuments,
  scopedStories,
}: KanbanBoardProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<IStory | null>(null);
  const [dismissedAutoOpen, setDismissedAutoOpen] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<EStoryStatus | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Partial<Record<EStoryStatus, boolean>>>({});
  const [assigneeFilter, setAssigneeFilter] = useState<EAssigneeFilter>("all");
  const searchParams = useSearchParams();
  const router = useRouter();
  const labelFilter = searchParams.get("label");
  const move = useMoveStory(workspaceSlug, projectId, cycleId);
  const { data: user } = useAuthUser();
  const { data: members } = useMembers(workspaceSlug);
  const { data: labels } = useProjectLabels(workspaceSlug, projectId);
  const { data: estimates } = useProjectEstimates(workspaceSlug, projectId);
  const { labels: stateLabels } = useProjectStateLabels(workspaceSlug, projectId);

  const columns = DEFAULT_COLUMNS.map((col) => ({
    ...col,
    label: stateLabels[col.status],
  }));

  const labelMap = new Map((labels ?? []).map((l) => [l.id, l]));

  const estimateMap = new Map((estimates ?? []).map((e) => [e.id, e]));

  const assigneeMap = buildAssigneeMap(members ?? []);

  const myCount = user ? stories.filter((s) => s.assignee_id === user.id).length : 0;

  let visibleStories = stories;
  if (showAssigneeFilter && assigneeFilter === "mine" && user) {
    visibleStories = visibleStories.filter((s) => s.assignee_id === user.id);
  }
  if (labelFilter) {
    // `.some` over each story's own (short) label list — one id against a handful.
    visibleStories = visibleStories.filter((s) => (s.label_ids ?? []).some((id) => id === labelFilter));
  }

  const onLabelFilterChange = (labelId: string | null) => {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(searchParams.toString());
    if (labelId) params.set("label", labelId);
    else params.delete("label");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const initialStory = initialOpenStoryId
    ? stories.find((s) => s.id === initialOpenStoryId)
    : undefined;

  const shouldPeekRedirect =
    !!initialStory && !initialStory.bmad?.is_locked && !initialStory.bmad;

  const autoOpenStory =
    enableAgentChat &&
    initialStory &&
    !initialStory.bmad?.is_locked &&
    initialStory.bmad
      ? initialStory
      : null;

  const peekRedirectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shouldPeekRedirect || !initialStory) return;
    if (peekRedirectedRef.current === initialOpenStoryId) return;
    peekRedirectedRef.current = initialOpenStoryId ?? null;
    router.push(peekHref(initialStory), { scroll: false });
  }, [shouldPeekRedirect, initialStory, initialOpenStoryId, router]);

  const activeStory = selected ?? (dismissedAutoOpen ? null : autoOpenStory);
  const sheetOpen = open || (activeStory !== null && selected === null && !dismissedAutoOpen);

  const openStory = (story: IStory) => {
    if (story.bmad?.is_locked) {
      const lock = getBmadLockMessage(story, stories);
      if (lock?.blockerStoryId) {
        const blocker = stories.find((s) => s.id === lock.blockerStoryId);
        if (blocker) {
          router.push(peekHref(blocker), { scroll: false });
          return;
        }
      }
      return;
    }
    // Non-BMAD cards, and BMAD cards on boards that don't host the inline agent
    // chat (e.g. the cycle Board view), open the detail peek — from which the
    // user can still "Work with GigsAI". Only the chat-enabled boards (modules,
    // views) open the StoryPanel chat sheet directly. Previously a BMAD card on a
    // non-chat board silently did nothing on click.
    if (!enableAgentChat || !story.bmad) {
      router.push(peekHref(story), { scroll: false });
      return;
    }
    setSelected(story);
    setOpen(true);
  };

  const onDrop = (status: EStoryStatus, storyId: string) => {
    setDragOverCol(null);
    const story = stories.find((s) => s.id === storyId);
    if (!story || story.status === status) return;
    if (story.bmad?.is_locked) return;
    if (
      status === EStoryStatus.Done &&
      story.bmad?.workflow === "bmad-check-implementation-readiness"
    ) {
      openStory(story);
      return;
    }
    move.mutate({ storyId, status });
  };

  if (isPending) {
    return (
      <div className="flex gap-(--kanban-gap) bg-surface-2 p-(--kanban-pad-x)">
        {columns.map((col) => (
          <SkeletonReveal
            key={col.status}
            isLoading
            className="h-48 w-(--kanban-column-w) shrink-0"
            skeleton={
              <div className="size-full rounded-lg bg-layer-1" />
            }
          >
            <div />
          </SkeletonReveal>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load stories"
          description="Something went wrong. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="board"
          title={emptyTitle}
          description={emptyDescription}
          actions={emptyAction ? [emptyAction] : undefined}
        />
      </div>
    );
  }

  if (visibleStories.length === 0 && labelFilter) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-4">
          {showAssigneeFilter ? (
            <BoardAssigneeFilter value={assigneeFilter} onChange={setAssigneeFilter} myCount={myCount} />
          ) : null}
          <BoardLabelFilter labels={labels ?? []} value={labelFilter} onChange={onLabelFilterChange} />
        </div>
        <EmptyState
          assetKey="search-empty"
          title="No stories with this label"
          description="Try another label or clear the filter to see all stories."
          actions={[{ label: "Clear filter", onClick: () => onLabelFilterChange(null) }]}
        />
      </div>
    );
  }

  if (visibleStories.length === 0 && assigneeFilter === "mine") {
    return (
      <div className="flex flex-col gap-4 p-6">
        {showAssigneeFilter ? (
          <BoardAssigneeFilter value={assigneeFilter} onChange={setAssigneeFilter} myCount={myCount} />
        ) : null}
        <EmptyState
          assetKey="board"
          title="No tasks assigned to you"
          description="Ask a project lead to assign stories from the story panel, or switch to all stories."
          actions={[{ label: "Show all stories", onClick: () => setAssigneeFilter("all") }]}
        />
      </div>
    );
  }

  return (
    <div className="gn-board-surface">
      {(showAssigneeFilter || (labels ?? []).length > 0) ? (
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border/60 px-(--kanban-pad-x) py-3">
          {showAssigneeFilter ? (
            <BoardAssigneeFilter value={assigneeFilter} onChange={setAssigneeFilter} myCount={myCount} />
          ) : null}
          <BoardLabelFilter labels={labels ?? []} value={labelFilter} onChange={onLabelFilterChange} />
        </div>
      ) : null}
      <div className="gn-kanban">
        {columns.map((col) => {
          const items = visibleStories.filter((s) => s.status === col.status);
          const collapsed = Boolean(collapsedCols[col.status]);
          return (
            <div
              key={col.status}
              className={cn(
                "gn-kanban-col",
                dragOverCol === col.status && "is-drag-over",
                collapsed && "is-collapsed",
              )}
              onDragOver={
                enableDragDrop
                  ? (e) => {
                      e.preventDefault();
                      setDragOverCol(col.status);
                    }
                  : undefined
              }
              onDragLeave={() => setDragOverCol(null)}
              onDrop={
                enableDragDrop
                  ? (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/story-id");
                      if (id) onDrop(col.status, id);
                    }
                  : undefined
              }
            >
              <div
                className="gn-kanban-col-header"
                onClick={
                  collapsed
                    ? () =>
                        setCollapsedCols((prev) => ({
                          ...prev,
                          [col.status]: false,
                        }))
                    : undefined
                }
              >
                <span className="gn-kanban-col-icon">
                  <StatusIcon status={col.status} className="size-3.5" />
                </span>
                <span className="gn-kanban-col-title">{col.label}</span>
                <span className="gn-kanban-col-count">{items.length}</span>
                <div className="gn-kanban-col-actions">
                  <button
                    type="button"
                    className="gn-kanban-col-toggle"
                    aria-label={collapsed ? `Expand ${col.label}` : `Collapse ${col.label}`}
                    aria-expanded={!collapsed}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedCols((prev) => ({
                        ...prev,
                        [col.status]: !prev[col.status],
                      }));
                    }}
                  >
                    <HugeiconsIcon
                      icon={collapsed ? ArrowExpand01Icon : ArrowShrink01Icon}
                      className="size-3.5"
                    />
                  </button>
                </div>
              </div>
              <div className="gn-kanban-col-body">
                {items.map((story) => {
                  const storyLabels = (story.label_ids ?? []).flatMap(
                    (id) => labelMap.get(id) ?? [],
                  );
                  const estScale =
                    story.estimate_id && story.estimate_points != null
                      ? estimateMap.get(story.estimate_id)
                      : null;
                  const assignee =
                    story.assignee_id ? assigneeMap.get(story.assignee_id) ?? null : null;
                  const labelChips = storyLabels.map((l) => ({ name: l.name, color: l.color }));
                  const canDrag = enableDragDrop && !story.bmad?.is_locked;
                  const lockMessage = getBmadLockMessage(story, stories);

                  if (cardVariant === "work-item") {
                    return (
                      <WorkItemKanbanCard
                        key={story.id}
                        story={story}
                        identifier={projectIdentifier}
                        assignee={assignee}
                        labels={labelChips}
                        onOpen={openStory}
                        draggable={canDrag}
                        lockMessage={lockMessage}
                      />
                    );
                  }

                  return (
                    <StoryCard
                      key={story.id}
                      story={story}
                      assignee={assignee}
                      labels={labelChips}
                      estimate={
                        estScale && story.estimate_points != null
                          ? { points: story.estimate_points, type: estScale.type }
                          : null
                      }
                      onOpen={openStory}
                      draggable={canDrag}
                      lockMessage={lockMessage}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {activeStory?.bmad && enableAgentChat ? (
        <Sheet
          open={sheetOpen}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setDismissedAutoOpen(true);
              setSelected(null);
            }
          }}
        >
          <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
            <StoryPanel
              story={activeStory}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              cycleId={cycleId}
              projectDocuments={projectDocuments}
              scopedStories={scopedStories}
              onCompleted={() => {
                setOpen(false);
                setDismissedAutoOpen(true);
                setSelected(null);
              }}
            />
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
