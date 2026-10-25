"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, GripVerticalIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { IProjectLabel, IStory } from "@/types";
import { peekHref, storyCode } from "@/lib/issues/issue-routes";
import { storyTypeOf } from "@/lib/issues/story-type";
import { subItemCount } from "@/lib/issues/sub-item-count";
import { PriorityPicker } from "../shared/priority-picker";
import { StatusPicker } from "../shared/status-picker";
import { AssigneePicker } from "../shared/assignee-picker";
import { TypeGlyph } from "../shared/type-glyph";
import { useListDrag } from "./use-list-drag";
import type { Instruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/list-item";

const CHEVRON_SLOT = "size-5 shrink-0";
/**
 * Chevron + inline count share one fixed-width control. A parent's label
 * ("3" or "3/12") must not widen its row's gutter beyond a childless row's
 * plain spacer, or the priority/status/title columns drift per row — used at
 * both the button below and the childless-row spacer in `IssueListRow`.
 * `subItemCount` caps each side at "9+", so the widest label is "9+/9+" — five
 * glyphs, ~28px in the 32px the slot leaves after the chevron and gap.
 * `overflow-hidden` stays as a belt-and-braces guard, but with the cap doing
 * its job it should never actually clip anything.
 */
const CHEVRON_COUNT_SLOT = "h-5 w-12 shrink-0 overflow-hidden";
/**
 * Horizontal step per nesting level.
 *
 * The single source of truth: the row hands this to CSS as
 * `--gn-indent-step` so `.gn-row-guides` can draw a rule per level without
 * repeating the number. Writing 24 in both places is how guides end up
 * one step out of line with the rows they describe.
 */
const INDENT_STEP = 24;

/** Single work-item row chrome (chevron slot, pickers, title link, metadata). */
export function IssueListRow({
  story,
  workspaceSlug,
  projectId,
  cycleId,
  identifier,
  labels,
  nestingLevel,
  revealIndex,
  hasChildren = false,
  chevron,
  checkbox,
  actions,
  groupKey,
  dragEnabled = false,
  onRowDrop,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  cycleId?: string;
  identifier: string;
  labels?: IProjectLabel[];
  nestingLevel: number;
  /** Position among a parent's children, which staggers the reveal. Set on
   *  every nested row, not only on a just-expanded one: `expandedIssueIds` is
   *  persisted, so an already-expanded parent's children also fade in on a
   *  fresh mount (page load, back-navigation, Flat→Hierarchy). Omitted for
   *  top-level rows, which must never animate. */
  revealIndex?: number;
  /** Whether this row has children matching the current view — the same value
   *  that draws the chevron, so weight and chevron can never disagree. */
  hasChildren?: boolean;
  chevron?: ReactNode | null;
  checkbox?: ReactNode;
  actions?: ReactNode;
  groupKey?: string;
  dragEnabled?: boolean;
  onRowDrop?: (args: { sourceId: string; targetId: string; groupKey: string; instruction: Instruction }) => void;
}) {
  const indent = nestingLevel * INDENT_STEP;

  const { ref, handleRef, instruction } = useListDrag({
    storyId: story.id,
    enabled: dragEnabled,
    onDrop: ({ sourceId, targetId, instruction }) =>
      onRowDrop?.({ sourceId, targetId, groupKey: groupKey ?? "", instruction }),
  });

  return (
    <div
      ref={ref}
      className={cn(
        "group relative isolate flex cursor-pointer items-center gap-2.5 border-b py-2 pr-4 transition-colors hover:bg-accent/40",
        // Narrow list (<42rem, e.g. phones or a squeezed column): the fixed slots
        // leave the title no width, so it takes its own first line and the
        // hover-only drag slot, type glyph and code drop out.
        "@max-2xl/rows:flex-wrap @max-2xl/rows:gap-x-1.5 @max-2xl/rows:gap-y-1",
        // Dropping onto the middle of a row (combine) links the dragged item as
        // a child — highlight the whole row as the prospective parent (GIN-80).
        instruction?.operation === "combine" &&
          "rounded-sm bg-primary/5 ring-2 ring-inset ring-primary",
        revealIndex !== undefined && "t-issue-child-row",
        nestingLevel > 0 && "gn-row-guides",
      )}
      style={
        {
          paddingLeft: `${16 + indent}px`,
          "--i": revealIndex,
          "--depth": nestingLevel,
          "--gn-indent-step": `${INDENT_STEP}px`,
        } as CSSProperties
      }
    >
      {/* Full-row hit target — real element (not ::after on the title) so it
          stays contained by this row even when an ancestor has filter/transform. */}
      <Link
        href={peekHref(story)}
        scroll={false}
        className="absolute inset-0 z-0"
        aria-label={story.title}
      />

      {instruction?.operation === "reorder-before" ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-primary" />
      ) : null}
      {instruction?.operation === "reorder-after" ? (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-0.5 bg-primary" />
      ) : null}

      {/* The slot is unconditional; only its contents are conditional. Rendering
          nothing when a row can't be dragged cost every child row 20px of slot
          plus the 10px flex gap — 30px against a 24px indent — so a child
          landed LEFT of its parent and expanding a row read as siblings
          appearing. Nothing else on the row may vary in width by depth. */}
      {dragEnabled ? (
        <button
          ref={handleRef}
          type="button"
          tabIndex={-1}
          aria-label="Drag to reorder"
          className={cn(
            "relative z-10 flex cursor-grab items-center justify-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing @max-2xl/rows:hidden",
            CHEVRON_SLOT,
          )}
        >
          <HugeiconsIcon icon={GripVerticalIcon} className="size-3.5" />
        </button>
      ) : (
        <span className={cn("relative z-10 @max-2xl/rows:hidden", CHEVRON_SLOT)} aria-hidden />
      )}

      {checkbox ? <span className="relative z-10 flex shrink-0 items-center">{checkbox}</span> : null}
      {chevron === null ? null : (
        chevron ?? <span className={cn("relative z-10", CHEVRON_COUNT_SLOT)} aria-hidden />
      )}

      <span className="relative z-10 flex shrink-0 items-center">
        <PriorityPicker
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          compact
        />
      </span>
      <span className="relative z-10 flex shrink-0 items-center">
        <StatusPicker
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
        />
      </span>
      <span className="pointer-events-none relative z-10 flex shrink-0 items-center @max-2xl/rows:hidden">
        <TypeGlyph type={storyTypeOf(story)} className="size-3.5" />
      </span>
      <span className="pointer-events-none relative z-10 w-16 shrink-0 truncate font-mono text-xs text-muted-foreground @max-2xl/rows:hidden">
        {storyCode(identifier, story)}
      </span>
      {/* Weight carries the one thing indentation alone can't: whether this row
          is a container. Every title used to be `font-medium`, so a parent and
          a leaf were indistinguishable until you found the chevron. Fed from
          the same `canExpand` that draws the chevron, so the two agree. */}
      <span
        className={cn(
          "pointer-events-none relative z-10 min-w-0 flex-1 truncate text-13 text-foreground group-hover:text-primary @max-2xl/rows:order-first @max-2xl/rows:basis-full",
          hasChildren ? "font-medium" : "font-normal",
        )}
      >
        {story.title}
      </span>

      {labels?.map((label) => (
        <span
          key={label.id}
          className="pointer-events-none relative z-10 hidden shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex"
          style={{ borderColor: `${label.color}55` }}
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
          {label.name}
        </span>
      ))}

      {story.target_date ? (
        <span className="pointer-events-none relative z-10 hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground md:inline">
          {new Date(story.target_date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      ) : (
        <span className="pointer-events-none relative z-10 hidden w-20 shrink-0 md:inline" />
      )}

      <span className="relative z-10 flex shrink-0 items-center @max-2xl/rows:ml-auto">
        <AssigneePicker
          story={story}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
        />
      </span>

      {actions ? <span className="relative z-10 flex shrink-0 items-center">{actions}</span> : null}
    </div>
  );
}

export function IssueListRowChevron({
  expanded,
  matchCount,
  totalCount,
  onToggle,
}: {
  expanded: boolean;
  /** Children matching the current filter — what expanding actually reveals. */
  matchCount: number;
  /** The item's total children per the API, filter or no filter. */
  totalCount: number;
  onToggle: () => void;
}) {
  // "3 of 7" (spoken) tells a screen-reader user the filter is hiding work
  // BEFORE they click; "3/7" (label) is the compact on-row form that fits the
  // fixed-width slot below.
  const { label, spoken, hidden } = subItemCount(matchCount, totalCount);

  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse sub-work items (${spoken})` : `Expand sub-work items (${spoken})`}
      title={hidden ? `${spoken} sub-work items match your filters` : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative z-10 flex items-center justify-center gap-0.5 rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
        CHEVRON_COUNT_SLOT,
      )}
    >
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className={cn(
          // Same duration and curve as the rows it reveals, so the chevron
          // turning and the sub-items settling read as one gesture.
          "size-3.5 shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          expanded ? "rotate-90" : "rotate-0",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "shrink-0 text-[11px] tabular-nums leading-4",
          hidden ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}
