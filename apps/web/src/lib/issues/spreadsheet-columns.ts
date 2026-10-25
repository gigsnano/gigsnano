/**
 * Spreadsheet column registry (GIN-31, Plane parity).
 *
 * Single source of truth for which property columns the Work Items spreadsheet
 * can show, their labels, default widths, and whether they support header sort.
 * The persisted per-user layout (order / visibility / width) lives in the
 * issues-view store; this module only holds the static catalog + defaults.
 */

import type { TSortKey } from "./story-sort";

/** Sticky "Work item" title column defaults (resizable, persisted separately). */
export const TITLE_COLUMN = { defaultWidth: 300, minWidth: 168 } as const;

/** Every property column the spreadsheet can render (besides the sticky title). */
export type SpreadsheetColumnKey =
  | "status"
  | "priority"
  | "assignee"
  | "type"
  | "label"
  | "start_date"
  | "target_date"
  | "estimate"
  | "cycle"
  | "module"
  | "created_at"
  | "updated_at"
  | "sub_issue";

export interface ISpreadsheetColumnMeta {
  label: string;
  defaultWidth: number;
  minWidth: number;
  /** Whether the header offers click-to-sort (values that order trivially). */
  sortable: boolean;
  /** Whether the header mounts a column quick filter (GIN-169). */
  filterable?: boolean;
}

/** One persisted column: identity + visibility + current width. */
export interface ISpreadsheetColumn {
  key: SpreadsheetColumnKey;
  visible: boolean;
  width: number;
}

export const SPREADSHEET_COLUMN_META: Record<SpreadsheetColumnKey, ISpreadsheetColumnMeta> = {
  status: { label: "Status", defaultWidth: 150, minWidth: 120, sortable: true, filterable: true },
  priority: { label: "Priority", defaultWidth: 140, minWidth: 110, sortable: true, filterable: true },
  assignee: { label: "Assignee", defaultWidth: 160, minWidth: 120, sortable: true, filterable: true },
  type: { label: "Type", defaultWidth: 130, minWidth: 100, sortable: true, filterable: true },
  // label/cycle/module sort by opaque id, so header sort is not offered (ponytail).
  label: { label: "Label", defaultWidth: 170, minWidth: 120, sortable: false, filterable: true },
  start_date: { label: "Start date", defaultWidth: 130, minWidth: 110, sortable: true },
  target_date: { label: "Due date", defaultWidth: 130, minWidth: 110, sortable: true, filterable: true },
  estimate: { label: "Estimate", defaultWidth: 120, minWidth: 100, sortable: true },
  cycle: { label: "Cycle", defaultWidth: 150, minWidth: 120, sortable: false },
  module: { label: "Module", defaultWidth: 150, minWidth: 120, sortable: false },
  created_at: { label: "Created", defaultWidth: 130, minWidth: 110, sortable: true, filterable: true },
  updated_at: { label: "Updated", defaultWidth: 130, minWidth: 110, sortable: true },
  sub_issue: { label: "Sub-items", defaultWidth: 110, minWidth: 90, sortable: true },
};

/**
 * The shared sort key behind each header. Columns that order by an opaque id
 * (label, cycle, module) have none, which is the same thing `sortable: false`
 * says — this is the mapping that lets a header click drive the one sort list
 * every layout reads.
 */
export const COLUMN_SORT_KEY: Partial<Record<SpreadsheetColumnKey, TSortKey>> = {
  status: "status",
  priority: "priority",
  assignee: "assignee",
  type: "type",
  start_date: "start",
  target_date: "due",
  estimate: "estimate",
  created_at: "created",
  updated_at: "updated",
  sub_issue: "subItems",
};

/** Column order shown to a fresh user (Plane-ish); created/updated hidden by default. */
export const SPREADSHEET_COLUMN_ORDER: SpreadsheetColumnKey[] = [
  "status",
  "priority",
  "assignee",
  "type",
  "label",
  "start_date",
  "target_date",
  "estimate",
  "cycle",
  "module",
  "sub_issue",
  "created_at",
  "updated_at",
];

const DEFAULT_HIDDEN: SpreadsheetColumnKey[] = ["created_at", "updated_at"];

export const DEFAULT_SPREADSHEET_COLUMNS: ISpreadsheetColumn[] = SPREADSHEET_COLUMN_ORDER.map(
  (key) => ({
    key,
    visible: !DEFAULT_HIDDEN.includes(key),
    width: SPREADSHEET_COLUMN_META[key].defaultWidth,
  }),
);
