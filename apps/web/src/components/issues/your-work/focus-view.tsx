"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, SparklesIcon, UserIcon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { StatusIcon } from "@/components/issues/shared/status-icon";
import { PriorityGlyph } from "@/components/issues/shared/priority-glyph";
import { storyCode, storyWorkHref } from "@/lib/issues/issue-routes";
import { cn } from "@/lib/utils";
import { EStoryPriority, type IAssignedStory } from "@/types";
import {
  dueDescriptor,
  FOCUS_SECTION_LABEL,
  type DueTone,
  type IFocusItem,
  type IFocusResult,
} from "@/lib/your-work/attention";

const DUE_TONE: Record<DueTone, string> = {
  overdue: "text-red-600 dark:text-red-400",
  today: "text-amber-600 dark:text-amber-400",
  soon: "text-blue-600 dark:text-blue-400",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
};

/** Owner chip — visually AND accessibly distinguishes AI agents from people. */
function OwnerChip({ story, currentUserId }: { story: IAssignedStory; currentUserId?: string }) {
  if (story.ai_agent_id) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400"
        aria-label="Assigned to an AI agent"
      >
        <HugeiconsIcon icon={SparklesIcon} className="size-3" />
        AI
      </span>
    );
  }
  if (story.assignee_id && story.assignee_id === currentUserId) {
    return (
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" aria-label="Assigned to you">
        You
      </span>
    );
  }
  if (story.assignee_id) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        aria-label="Assigned to a teammate"
      >
        <HugeiconsIcon icon={UserIcon} className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground/60" aria-label="Unassigned">
      —
    </span>
  );
}

function FocusRow({
  item,
  workspaceSlug,
  currentUserId,
  index,
}: {
  item: IFocusItem<IAssignedStory>;
  workspaceSlug: string;
  currentUserId?: string;
  index: number;
}) {
  const { story, reason } = item;
  const href = `${storyWorkHref(workspaceSlug, story)}${story.bmad ? "" : "?from=work-items"}`;
  const code = storyCode(story.project_identifier, story);
  const due = dueDescriptor(story.target_date, new Date());
  const showPriority =
    story.priority === EStoryPriority.High || story.priority === EStoryPriority.Urgent;

  return (
    <li
      // motion-safe: decorative staggered rise; base state (below) is fully visible,
      // so headless/reduced-motion renders still show the row.
      className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300 motion-safe:ease-out"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60 active:bg-muted focus-visible:bg-muted/60 focus-visible:outline-none"
      >
        <StatusIcon status={story.status} className="shrink-0" />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {showPriority ? <PriorityGlyph priority={story.priority} className="shrink-0" /> : null}
            <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
              {story.title}
            </span>
          </span>
          {/* Meta line — always visible so code/project/reason/due survive every width. */}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{code}</span>
            <span className="truncate">{story.project_name}</span>
            {reason ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                <HugeiconsIcon icon={Alert02Icon} className="size-3" />
                {reason}
              </span>
            ) : null}
            {due.tone !== "none" ? (
              <span className={cn("tabular-nums", DUE_TONE[due.tone])}>{due.label}</span>
            ) : null}
          </span>
        </span>

        <OwnerChip story={story} currentUserId={currentUserId} />
      </Link>
    </li>
  );
}

export function FocusView({
  workspaceSlug,
  result,
  isPending,
  isError,
  refetch,
  currentUserId,
}: {
  workspaceSlug: string;
  result?: IFocusResult<IAssignedStory>;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  currentUserId?: string;
}) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonReveal
            key={i}
            isLoading
            className="h-11"
            skeleton={<div className="size-full rounded-lg border bg-card" />}
          >
            <div />
          </SkeletonReveal>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load your work"
        description="Something went wrong reaching your work items. Please try again."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  const sections = result?.sections ?? [];
  if (sections.length === 0) {
    return (
      <EmptyState
        assetKey="board"
        title="You're all caught up"
        description="No open work is assigned to you right now. Pick up something new or check in on your projects."
        actions={[{ label: "Browse projects", href: `/${workspaceSlug}/projects` }]}
      />
    );
  }

  let rowIndex = 0;
  return (
    <div className="flex flex-col">
      {sections.map(({ section, items }) => (
        <details key={section} open className="border-b border-border/50 last:border-0">
          <summary className="flex cursor-pointer select-none items-center gap-2 py-2.5 text-sm font-semibold text-foreground">
            {FOCUS_SECTION_LABEL[section]}
            <span className="rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
              {items.length}
            </span>
          </summary>
          <ul className="flex flex-col pb-2">
            {items.map((item) => (
              <FocusRow
                key={item.story.id}
                item={item}
                workspaceSlug={workspaceSlug}
                currentUserId={currentUserId}
                index={rowIndex++}
              />
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
