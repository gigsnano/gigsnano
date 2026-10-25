import type { IColumnFilterFieldMeta } from "@/components/issues/filters/column-filter-control";

import type { SpreadsheetColumnKey } from "./spreadsheet-columns";

/** Sticky title column filter key (not a SpreadsheetColumnKey). */
export const TITLE_FILTER_KEY = "title" as const;

const COLUMN_FILTER_META: Partial<Record<SpreadsheetColumnKey, IColumnFilterFieldMeta>> = {
  status: { key: "status", label: "Status", kind: "multi" },
  priority: { key: "priority", label: "Priority", kind: "multi" },
  type: { key: "type", label: "Type", kind: "multi" },
  assignee: { key: "assignee", label: "Assignee", kind: "multi" },
  label: { key: "label", label: "Label", kind: "multi" },
  target_date: { key: "due", label: "Due date", kind: "dateRange" },
  created_at: { key: "created", label: "Created", kind: "dateRange" },
};

/** GigsQL field meta for the sticky "Work item" title column. */
export const TITLE_FILTER_META: IColumnFilterFieldMeta = {
  key: "title",
  label: "Work item",
  kind: "text",
};

/** Filter field meta for a property column, or null when the column is not filterable. */
export function getColumnFilterMeta(key: SpreadsheetColumnKey): IColumnFilterFieldMeta | null {
  return COLUMN_FILTER_META[key] ?? null;
}

/** Whether the spreadsheet column supports a header quick filter. */
export function isFilterableColumn(key: SpreadsheetColumnKey): boolean {
  return key in COLUMN_FILTER_META;
}
