"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  Diamond01Icon,
  GridTableIcon,
  Key01Icon,
  Link01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { IErdColumn, IErdTable } from "@/types";

/** Columns shown when a table is collapsed; the rest fold behind "N more". */
export const ERD_COLLAPSED_COLUMNS = 5;

/** React Flow node data carries the table plus highlight/select/collapse state. */
export interface IErdTableNodeData {
  table: IErdTable;
  dimmed: boolean;
  selected: boolean;
  /** Part of the active focus set (hovered/selected + neighbors) → green glow. */
  glow: boolean;
  collapsed: boolean;
  onSelect?: (name: string) => void;
  onToggleCollapse?: (name: string) => void;
  [key: string]: unknown;
}

/** Liam-style column glyph: key = PK, link = FK, filled diamond = NOT NULL,
 *  outline diamond = nullable. A render helper (not a component). */
function columnIcon(column: IErdColumn) {
  if (column.pk) {
    return (
      <HugeiconsIcon icon={Key01Icon} className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
    );
  }
  if (column.fk) {
    return (
      <HugeiconsIcon icon={Link01Icon} className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
    );
  }
  if (column.nullable === false) {
    return <HugeiconsIcon icon={Diamond01Icon} className="size-3 shrink-0 fill-current text-foreground/70" />;
  }
  return <HugeiconsIcon icon={Diamond01Icon} className="size-3 shrink-0 text-muted-foreground/60" />;
}

export function ErdTableNode({ data }: NodeProps) {
  const { table, dimmed, selected, glow, collapsed, onSelect, onToggleCollapse } =
    data as unknown as IErdTableNodeData;

  const collapsible = table.columns.length > ERD_COLLAPSED_COLUMNS;
  const visibleColumns = collapsed ? table.columns.slice(0, ERD_COLLAPSED_COLUMNS) : table.columns;
  const hiddenCount = table.columns.length - visibleColumns.length;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Table ${table.name}${selected ? " (selected)" : ""}`}
      onClick={() => onSelect?.(table.name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(table.name);
        }
      }}
      className={cn(
        "min-w-[200px] max-w-[260px] cursor-pointer overflow-hidden rounded-lg border bg-card shadow-sm transition-all duration-300 ease-out",
        "hover:border-emerald-500/70 hover:shadow-[0_0_20px_rgba(16,185,129,0.35)]",
        dimmed ? "opacity-40" : "opacity-100",
        glow && "border-emerald-500/70 shadow-[0_0_20px_rgba(16,185,129,0.35)]",
        selected && "border-emerald-500 shadow-[0_0_22px_rgba(16,185,129,0.45)]",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <div className="flex items-center gap-1.5 border-b bg-muted/50 px-3 py-2">
        <HugeiconsIcon icon={GridTableIcon} className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm font-medium text-foreground">{table.name}</span>
        {collapsible ? (
          <button
            type="button"
            aria-label={collapsed ? "Expand columns" : "Collapse columns"}
            title={collapsed ? "Expand columns" : "Collapse columns"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.(table.name);
            }}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn("size-3.5 transition-transform", !collapsed && "rotate-180")}
            />
          </button>
        ) : null}
      </div>
      <div className="divide-y divide-border/50">
        {visibleColumns.map((c) => (
          <div key={c.name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
            {columnIcon(c)}
            <span className={cn("flex-1 truncate text-foreground", c.pk && "font-semibold")}>
              {c.name}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{c.type}</span>
          </div>
        ))}
      </div>
      {collapsed && hiddenCount > 0 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.(table.name);
          }}
          className="w-full border-t bg-muted/30 px-3 py-1 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          + {hiddenCount} more
        </button>
      ) : null}
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}
