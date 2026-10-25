"use client";

import {
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import { DESC_BY_DEFAULT } from "@/lib/issues/story-sort";
import {
  COLUMN_SORT_KEY,
  SPREADSHEET_COLUMN_META,
  TITLE_COLUMN,
  type ISpreadsheetColumn,
  type SpreadsheetColumnKey,
} from "@/lib/issues/spreadsheet-columns";
import {
  getColumnFilterMeta,
  TITLE_FILTER_META,
} from "@/lib/issues/column-filter-meta";
import {
  STORY_STATUS_META,
  STORY_STATUS_ORDER,
  STORY_PRIORITY_META,
  STORY_PRIORITY_ORDER,
  STORY_TYPE_META,
  STORY_TYPE_ORDER,
} from "@/constants/story-meta";
import {
  ColumnFilterControl,
} from "@/components/issues/filters/column-filter-control";
import { StatusIcon } from "../../shared/status-icon";
import { PriorityGlyph } from "../../shared/priority-glyph";
import { TypeGlyph } from "../../shared/type-glyph";

import { useColumnResize } from "./use-column-resize";

const REORDER_MIME = "application/x-gn-column";

export interface ISpreadsheetFilterOptions {
  assigneeOptions: { value: string; label: string }[];
  labelOptions: { value: string; label: string; icon?: ReactNode }[];
}

/** Thin col-resize affordance shared by the title + property header cells. */
function ResizeHandle({
  label,
  resize,
}: {
  label: string;
  resize: ReturnType<typeof useColumnResize>;
}) {
  return (
    <span
      role="separator"
      aria-label={`Resize ${label} column`}
      onPointerDown={resize.handlers.onPointerDown}
      onPointerMove={resize.handlers.onPointerMove}
      onPointerUp={resize.handlers.onPointerUp}
      className={cn(
        "-mr-3 ml-1 h-5 w-1.5 shrink-0 cursor-col-resize rounded bg-transparent transition-colors hover:bg-border group-hover/th:bg-border/60",
        resize.resizing && "bg-primary/60",
      )}
    />
  );
}

function statusFilterOptions() {
  return STORY_STATUS_ORDER.map((status) => ({
    value: status,
    label: STORY_STATUS_META[status].label,
    icon: <StatusIcon status={status} />,
  }));
}

function priorityFilterOptions() {
  return STORY_PRIORITY_ORDER.map((priority) => ({
    value: priority,
    label: STORY_PRIORITY_META[priority].label,
    icon: <PriorityGlyph priority={priority} />,
  }));
}

function typeFilterOptions() {
  return STORY_TYPE_ORDER.map((type) => ({
    value: type,
    label: STORY_TYPE_META[type].label,
    icon: <TypeGlyph type={type} className="size-3.5" />,
  }));
}

function ColumnHeaderFilter({
  columnKey,
  filterOptions,
}: {
  columnKey: SpreadsheetColumnKey;
  filterOptions: ISpreadsheetFilterOptions;
}) {
  const field = getColumnFilterMeta(columnKey);
  const filters = useIssuesViewStore((s) => s.filters);
  const setFilterFacet = useIssuesViewStore((s) => s.setFilterFacet);
  const setDueRange = useIssuesViewStore((s) => s.setDueRange);
  const setCreatedRange = useIssuesViewStore((s) => s.setCreatedRange);

  if (!field) return null;

  if (field.kind === "multi") {
    const facetKey = field.key as "status" | "priority" | "type" | "assignee" | "label";
    const value = filters[facetKey];
    const options =
      facetKey === "status"
        ? statusFilterOptions()
        : facetKey === "priority"
          ? priorityFilterOptions()
          : facetKey === "type"
            ? typeFilterOptions()
            : facetKey === "assignee"
              ? [
                  ...filterOptions.assigneeOptions,
                  { value: "unassigned", label: "Unassigned" },
                ]
              : filterOptions.labelOptions;

    return (
      <ColumnFilterControl
        field={field}
        value={value}
        options={options}
        activeCount={value.length}
        onChange={(next) => setFilterFacet(facetKey, next as string[])}
      />
    );
  }

  if (field.kind === "dateRange") {
    const isDue = field.key === "due";
    const value = isDue
      ? { from: filters.dueFrom, to: filters.dueTo }
      : { from: filters.createdFrom, to: filters.createdTo };
    const activeCount = value.from || value.to ? 1 : 0;

    return (
      <ColumnFilterControl
        field={field}
        value={value}
        activeCount={activeCount}
        onChange={(next) => {
          const range = next as { from: string | null; to: string | null };
          if (isDue) setDueRange(range.from, range.to);
          else setCreatedRange(range.from, range.to);
        }}
      />
    );
  }

  return null;
}

function TitleHeaderFilter() {
  const title = useIssuesViewStore((s) => s.filters.title);
  const setFilterTitle = useIssuesViewStore((s) => s.setFilterTitle);
  const activeCount = title.trim() ? 1 : 0;

  return (
    <ColumnFilterControl
      field={TITLE_FILTER_META}
      value={title}
      activeCount={activeCount}
      onChange={(next) => setFilterTitle(next as string)}
    />
  );
}

function HeaderCell({
  column,
  filterOptions,
}: {
  column: ISpreadsheetColumn;
  filterOptions: ISpreadsheetFilterOptions;
}) {
  const meta = SPREADSHEET_COLUMN_META[column.key];
  const sort = useIssuesViewStore((s) => s.sort);
  const setSort = useIssuesViewStore((s) => s.setSort);
  const addSortLevel = useIssuesViewStore((s) => s.addSortLevel);
  const flipSortDir = useIssuesViewStore((s) => s.flipSortDir);
  const setWidth = useIssuesViewStore((s) => s.setSpreadsheetColumnWidth);
  const reorder = useIssuesViewStore((s) => s.reorderSpreadsheetColumn);

  const resize = useColumnResize(column.width, meta.minWidth, (w) => setWidth(column.key, w));
  const [dropTarget, setDropTarget] = useState(false);

  const sortKey = COLUMN_SORT_KEY[column.key];
  const levelIndex = sortKey ? sort.findIndex((l) => l.key === sortKey) : -1;
  const level = levelIndex >= 0 ? sort[levelIndex] : null;

  /**
   * A plain click means "sort by this" and replaces the list; shift+click adds
   * a level, which is how you reach "priority, then due date" without opening
   * the Display panel. Clicking the column you are already sorted on flips it.
   */
  const onSortClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (!sortKey) return;
    if (levelIndex >= 0) {
      flipSortDir(levelIndex);
      return;
    }
    if (e.shiftKey) {
      addSortLevel(sortKey);
      return;
    }
    setSort([{ key: sortKey, dir: DESC_BY_DEFAULT.includes(sortKey) ? "desc" : "asc" }]);
  };
  const width = resize.width;
  const style: CSSProperties = { width, minWidth: width, maxWidth: width };

  const onDragStart = (e: DragEvent<HTMLTableCellElement>) => {
    if (resize.resizing) {
      // A resize is underway (handle lives inside this draggable th) — don't reorder.
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(REORDER_MIME, column.key);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: DragEvent<HTMLTableCellElement>) => {
    if (e.dataTransfer.types.includes(REORDER_MIME)) {
      e.preventDefault();
      setDropTarget(true);
    }
  };
  const onDrop = (e: DragEvent<HTMLTableCellElement>) => {
    e.preventDefault();
    setDropTarget(false);
    const from = e.dataTransfer.getData(REORDER_MIME) as SpreadsheetColumnKey;
    if (from) reorder(from, column.key);
  };

  return (
    <th
      style={style}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={() => setDropTarget(false)}
      onDrop={onDrop}
      className={cn(
        "group/th sticky top-0 z-[2] whitespace-nowrap border-r bg-background px-3 py-2 text-left font-medium shadow-[inset_0_-1px_0_var(--border)]",
        dropTarget && "bg-accent/50",
      )}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={!sortKey}
          onClick={onSortClick}
          title={sortKey ? "Click to sort · Shift+click to add a level" : undefined}
          aria-label={
            level
              ? `Sorted by ${meta.label}, ${level.dir === "asc" ? "ascending" : "descending"}. Activate to reverse.`
              : sortKey
                ? `Sort by ${meta.label}`
                : meta.label
          }
          className={cn(
            "flex min-w-0 flex-1 cursor-grab items-center gap-1 text-xs font-medium text-muted-foreground active:cursor-grabbing",
            sortKey && "hover:text-foreground",
            level && "text-foreground",
          )}
        >
          <span className="truncate">{meta.label}</span>
          {level ? (
            <span aria-hidden className="flex items-center gap-0.5 text-[10px] text-foreground">
              <span className="t-sort-arrow">{level.dir === "asc" ? "↑" : "↓"}</span>
              {/* The level's rank, shown only once there is more than one to rank. */}
              {sort.length > 1 ? (
                <span className="tabular-nums text-muted-foreground">{levelIndex + 1}</span>
              ) : null}
            </span>
          ) : null}
        </button>
        {meta.filterable ? (
          <span
            className="shrink-0"
            onPointerDown={(e) => e.stopPropagation()}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          >
            <ColumnHeaderFilter columnKey={column.key} filterOptions={filterOptions} />
          </span>
        ) : null}
        <ResizeHandle label={meta.label} resize={resize} />
      </div>
    </th>
  );
}

/** Sticky, resizable "Work item" title header cell. */
function TitleHeaderCell() {
  const width = useIssuesViewStore((s) => s.spreadsheetTitleWidth);
  const setWidth = useIssuesViewStore((s) => s.setSpreadsheetTitleWidth);
  const resize = useColumnResize(width, TITLE_COLUMN.minWidth, setWidth);
  const w = resize.width;

  return (
    <th
      style={{ width: w, minWidth: w, maxWidth: w }}
      className="group/th sticky left-0 top-0 z-[4] whitespace-nowrap border-r bg-background px-4 py-2 text-left font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]"
    >
      <div className="flex items-center gap-0.5">
        <span className="min-w-0 flex-1 truncate text-xs">Work item</span>
        <span className="shrink-0" draggable={false} onDragStart={(e) => e.preventDefault()}>
          <TitleHeaderFilter />
        </span>
        <ResizeHandle label="Work item" resize={resize} />
      </div>
    </th>
  );
}

/** Sticky header row: pinned "Work item" column + the visible property columns. */
export function SpreadsheetHeader({
  columns,
  filterOptions,
}: {
  columns: ISpreadsheetColumn[];
  filterOptions: ISpreadsheetFilterOptions;
}) {
  return (
    <thead>
      <tr className="text-xs">
        <TitleHeaderCell />
        {columns.map((column) => (
          <HeaderCell key={column.key} column={column} filterOptions={filterOptions} />
        ))}
      </tr>
    </thead>
  );
}
