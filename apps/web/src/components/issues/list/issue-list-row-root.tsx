"use client";

import { sortStories, type ISortCtx } from "@/lib/issues/story-sort";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import type { IProjectLabel, IStory } from "@/types";
import type { ISortLevel } from "@/store/ui/issues-view.store";
import type { Instruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";
import { IssueListRow, IssueListRowChevron } from "./issue-list-row";
import { IssueRowActions } from "./issue-row-actions";
import { IssueRowCheckbox } from "./issue-row-checkbox";

/** List row with optional expand chevron and recursive child rows. */
export function IssueListRowRoot({
  story,
  childrenById,
  sortCtx,
  workspaceSlug,
  projectId,
  cycleId,
  identifier,
  labels,
  sort,
  nestingLevel = 0,
  revealIndex,
  orderedIds,
  groupKey,
  dragEnabled = false,
  onRowDrop,
}: {
  story: IStory;
  /** Matching children per parent, from `data.tree`. Empty in flat mode. */
  childrenById: Map<string, IStory[]>;
  /** Shared sort context, so children order the same here as everywhere else. */
  sortCtx?: ISortCtx;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  identifier: string;
  labels: Map<string, IProjectLabel>;
  sort: readonly ISortLevel[];
  nestingLevel?: number;
  /** Set on rows rendered as a parent's child — staggers their entrance. */
  revealIndex?: number;
  orderedIds: string[];
  groupKey?: string;
  dragEnabled?: boolean;
  onRowDrop?: (args: { sourceId: string; targetId: string; groupKey: string; instruction: Instruction }) => void;
}) {
  const showSubIssues = useIssuesViewStore((s) => s.showSubIssues);
  const expandedIssueIds = useIssuesViewStore((s) => s.expandedIssueIds);
  const toggleExpanded = useIssuesViewStore((s) => s.toggleExpanded);

  // The chevron is drawn from the very list the click reveals. It used to be
  // drawn from `sub_issue_count` — an unfiltered API counter — while the
  // expansion read an array the children had been filtered out of, so it was a
  // button that never did anything. These are now one lookup.
  const children = childrenById.get(story.id) ?? [];
  const canExpand = children.length > 0;
  const isExpanded = canExpand && expandedIssueIds.includes(story.id);
  const storyLabels = (story.label_ids ?? []).flatMap((id) => labels.get(id) ?? []);
  const childStories = isExpanded ? sortStories(children, sort, sortCtx) : [];

  const chevron = canExpand ? (
    <IssueListRowChevron
      expanded={isExpanded}
      matchCount={children.length}
      // ponytail: sub_issue_count can be 0/stale-low; children.length is the
      // best client-side fallback. Ceiling: a hidden count can silently read
      // as "not hidden" until the API returns a live total alongside filtered
      // results.
      totalCount={story.sub_issue_count || children.length}
      onToggle={() => toggleExpanded(story.id)}
    />
  ) : // Flat mode has no chevron column at all; hierarchy mode keeps the spacer
  // so childless rows still line up with the ones that expand. Read from the
  // store rather than inferred from an empty map — a hierarchy view where
  // nothing happens to nest still needs its column, or the rows jump the
  // moment one item gains a child.
  showSubIssues ? null : undefined;

  return (
    <>
      <IssueListRow
        story={story}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        identifier={identifier}
        labels={storyLabels}
        nestingLevel={nestingLevel}
        revealIndex={revealIndex}
        hasChildren={canExpand}
        chevron={chevron}
        checkbox={<IssueRowCheckbox storyId={story.id} orderedIds={orderedIds} />}
        actions={
          <IssueRowActions
            story={story}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
          />
        }
        groupKey={groupKey}
        dragEnabled={nestingLevel === 0 && dragEnabled}
        onRowDrop={onRowDrop}
      />

      {childStories.map((child, index) => (
        <IssueListRowRoot
          key={child.id}
          story={child}
          childrenById={childrenById}
          sortCtx={sortCtx}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          identifier={identifier}
          labels={labels}
          sort={sort}
          nestingLevel={nestingLevel + 1}
          revealIndex={index}
          orderedIds={orderedIds}
        />
      ))}
    </>
  );
}
