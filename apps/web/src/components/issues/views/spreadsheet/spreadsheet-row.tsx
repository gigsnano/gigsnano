"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { peekHref, storyCode } from "@/lib/issues/issue-routes";
import { sortStories } from "@/lib/issues/story-sort";
import { storyTypeOf } from "@/lib/issues/story-type";
import { subItemCount } from "@/lib/issues/sub-item-count";
import { cn } from "@/lib/utils";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import type { IStory } from "@/types";
import type { ISpreadsheetColumn } from "@/lib/issues/spreadsheet-columns";

import { TypeGlyph } from "../../shared/type-glyph";
import { PropertyCell, SheetTd, type ISpreadsheetCellCtx } from "./spreadsheet-cell";

/** Plane caps inline nesting at 3 levels; deeper items open in the peek view. */
const MAX_NESTING = 3;

/** One work-item row: sticky title cell + a cell per visible property column. */
export function SpreadsheetRow({
  story,
  childrenById,
  columns,
  ctx,
  identifier,
  nestingLevel = 0,
}: {
  story: IStory;
  /** Matching children per parent, from `data.tree`. Empty in flat mode. */
  childrenById: Map<string, IStory[]>;
  columns: ISpreadsheetColumn[];
  ctx: ISpreadsheetCellCtx;
  identifier: string;
  nestingLevel?: number;
}) {
  const expanded = useIssuesViewStore((s) => s.expandedIssueIds.includes(story.id));
  const toggleExpanded = useIssuesViewStore((s) => s.toggleExpanded);
  const titleWidth = useIssuesViewStore((s) => s.spreadsheetTitleWidth);
  const sort = useIssuesViewStore((s) => s.sort);
  // Same source as the list: the chevron and its payload are one lookup, so a
  // parent whose children the filter excluded simply has no chevron. This
  // replaces a per-parent `useSubStories` fetch that re-filtered client-side and
  // ignored the flat/nested mode entirely (a child rendered twice in flat mode).
  // Sorted the same way the List sorts its children, with the one shared
  // `sortCtx` from `useIssuesData` rather than a locally-built resolver — two
  // hand-rolled lambdas were identical in value but free to drift, and an
  // assignee sort that reads by name at one depth and by raw id at another is
  // exactly the cross-layout inconsistency this work exists to remove.
  const children = sortStories(childrenById.get(story.id) ?? [], sort, ctx.sortCtx);
  const canExpand = children.length > 0 && nestingLevel < MAX_NESTING;
  const isExpanded = expanded && canExpand;
  const count = subItemCount(children.length, story.sub_issue_count || children.length);

  return (
    <>
      <tr className="group hover:bg-accent/30">
        <td
          style={{ width: titleWidth, minWidth: titleWidth, maxWidth: titleWidth }}
          className="sticky left-0 z-[1] h-11 border-r border-b bg-background px-4 align-middle group-hover:bg-accent/30"
        >
          <div className="flex items-center gap-1.5" style={{ paddingLeft: nestingLevel * 16 }}>
            {/* Chevron + count, same pairing and same `subItemCount` the List
                uses: the number says what expanding will reveal, and "3/7"
                says the filter is hiding some — before the click, not after.
                Fixed width so the code/type/title columns stay aligned whether
                or not a row has children. */}
            <button
              type="button"
              aria-label={canExpand ? `${isExpanded ? "Collapse" : "Expand"} sub-items (${count.spoken})` : undefined}
              disabled={!canExpand}
              onClick={() => canExpand && toggleExpanded(story.id)}
              className={cn(
                "flex h-4 w-9 shrink-0 items-center gap-0.5 rounded text-muted-foreground",
                canExpand ? "hover:bg-accent hover:text-foreground" : "opacity-0",
              )}
            >
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className={cn(
                  "size-3.5 shrink-0 transition-transform motion-reduce:transition-none",
                  isExpanded && "rotate-90",
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "text-[11px] leading-none tabular-nums",
                  count.hidden && "text-primary",
                )}
              >
                {canExpand ? count.label : ""}
              </span>
            </button>
            <span className="w-14 shrink-0 truncate font-mono text-xs text-muted-foreground">
              {storyCode(identifier, story)}
            </span>
            <TypeGlyph type={storyTypeOf(story)} className="size-3.5 shrink-0" />
            <Link
              href={peekHref(story)}
              scroll={false}
              className="min-w-0 flex-1 truncate text-foreground hover:text-primary"
            >
              {story.title}
            </Link>
          </div>
        </td>
        {columns.map((column) => (
          <SheetTd key={column.key} width={column.width}>
            <PropertyCell column={column.key} story={story} ctx={ctx} />
          </SheetTd>
        ))}
      </tr>

      {isExpanded
        ? children.map((child) => (
            <SpreadsheetRow
              key={child.id}
              story={child}
              childrenById={childrenById}
              columns={columns}
              ctx={ctx}
              identifier={identifier}
              nestingLevel={nestingLevel + 1}
            />
          ))
        : null}
    </>
  );
}
