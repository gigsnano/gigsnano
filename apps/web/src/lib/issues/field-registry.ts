/**
 * Canonical Work Item Field Registry (GIN-313).
 *
 * ONE typed catalog of the fields every work-item surface can name — Visual
 * filters, GigsQL, the saved-View `filter_query` language, and the spreadsheet
 * columns. Each of those consumers derives its own list from this registry
 * (`filter-query.ts`, `gigsql.ts`, `spreadsheet-columns.ts`) so the four lists
 * can no longer drift apart — the divergence GIN-313 was filed to kill. The
 * `field-registry.test.ts` guard fails the build if any consumer's hard-coded
 * list stops being a subset of the registry.
 *
 * Scope: Phase 1 — fields already modelled on `IStory` and already honoured by a
 * real filter/column path. Phase 2/3 enterprise fields (SLA, risk, custom,
 * audit) are separate sub-tickets; add them HERE (never to a consumer's private
 * list) when their data lands, flipping capability flags on as the plumbing
 * ships.
 *
 * ponytail: this is a static registry. A server-backed `/field-registry`
 * capability endpoint replaces it wholesale when the backend ships it
 * (GIN-313 Phase 3) — consumers keep deriving from the same exported selectors,
 * so the swap is below this seam.
 */

/** Bumped when the registry's field set / capabilities change; saved views record it. */
export const FIELD_REGISTRY_VERSION = 1 as const;

/** How a field's values behave — drives operators, editors, and GigsQL value rules. */
export type TFieldDataType = "text" | "select" | "person" | "date" | "number" | "count" | "boolean";

/** Selector groupings, in display order (GIN-313 "Add field" UX). */
export type TFieldCategory =
  | "common"
  | "workflow"
  | "people"
  | "planning"
  | "dates"
  | "hierarchy"
  | "activity"
  | "custom";

export const FIELD_CATEGORY_ORDER: TFieldCategory[] = [
  "common",
  "workflow",
  "people",
  "planning",
  "hierarchy",
  "dates",
  "activity",
  "custom",
];

export const FIELD_CATEGORY_LABEL: Record<TFieldCategory, string> = {
  common: "Common",
  workflow: "Workflow",
  people: "People",
  planning: "Planning",
  hierarchy: "Hierarchy",
  dates: "Dates",
  activity: "Activity",
  custom: "Custom fields",
};

// Type-specific operator vocabularies (GIN-313 "Type-specific filter operators").
export const TEXT_OPERATORS = [
  "contains",
  "does not contain",
  "is",
  "is not",
  "starts with",
  "is empty",
  "is not empty",
] as const;
export const SELECT_OPERATORS = [
  "is",
  "is not",
  "is any of",
  "is none of",
  "is empty",
  "is not empty",
] as const;
export const PERSON_OPERATORS = [
  "is",
  "is not",
  "is any of",
  "is me",
  "is unassigned",
  "is empty",
  "is not empty",
] as const;
export const NUMBER_OPERATORS = [
  "equals",
  "not equal",
  "greater than",
  "greater than or equal",
  "less than",
  "less than or equal",
  "between",
  "is empty",
  "is not empty",
] as const;
export const DATE_OPERATORS = [
  "on",
  "before",
  "after",
  "between",
  "relative period",
  "overdue",
  "is empty",
  "is not empty",
] as const;
export const BOOLEAN_OPERATORS = ["is true", "is false"] as const;

const OPERATORS_BY_TYPE: Record<TFieldDataType, readonly string[]> = {
  text: TEXT_OPERATORS,
  select: SELECT_OPERATORS,
  person: PERSON_OPERATORS,
  date: DATE_OPERATORS,
  number: NUMBER_OPERATORS,
  count: NUMBER_OPERATORS,
  boolean: BOOLEAN_OPERATORS,
};

/** GigsQL value grammar for a field (mirrors gigsql.ts value-kind sets). */
export type TGigsqlValueKind = "select" | "text" | "date";

export interface WorkItemFieldDefinition {
  /** Canonical registry key (stable; saved views reference it). */
  key: string;
  label: string;
  category: TFieldCategory;
  dataType: TFieldDataType;
  source: "system" | "custom" | "computed";
  /** True only when a real end-to-end filter path exists (Add-field eligibility). */
  filterable: boolean;
  /** Type-specific operators (derived from dataType). */
  filterOperators: readonly string[];
  /** Can be shown as a spreadsheet column. */
  columnVisible: boolean;
  sortable: boolean;
  groupable: boolean;
  exportable: boolean;
  /** Shown in the "Common" always-visible facet strip vs. behind "Add field". */
  common?: boolean;
  // ---- consumer mappings (FE, until a server registry ships) ----
  /** Canonical field name in the GigsQL language (`gigsql.ts`), if valid there. */
  gigsqlField?: string;
  /** GigsQL value grammar; required alongside `gigsqlField`. */
  gigsqlValueKind?: TGigsqlValueKind;
  /** Saved-View `filter_query` colon field (`filter-query.ts`), if supported there. */
  viewFilterField?: string;
  /** Spreadsheet column key (`spreadsheet-columns.ts`), if column-capable. */
  columnKey?: string;
  permission?: string;
  featureFlag?: string;
  isExpensive?: boolean;
}

type TFieldSeed = Omit<WorkItemFieldDefinition, "filterOperators">;

/**
 * Phase-1 catalogue. `filterable`/`columnVisible` are true only where the
 * plumbing genuinely exists today — GIN-313 forbids exposing fields the data
 * model can't back. Fields with a `gigsqlField` but `filterable: false`
 * (start/updated dates) stay valid in a hand-typed GigsQL query without being
 * offered as toolbar filters, exactly as before this registry existed.
 */
const FIELD_SEEDS: TFieldSeed[] = [
  {
    key: "code",
    label: "Work item ID",
    category: "common",
    dataType: "text",
    source: "computed",
    filterable: false,
    columnVisible: false, // rendered by the sticky title column
    sortable: true,
    groupable: false,
    exportable: true,
  },
  {
    key: "title",
    label: "Title",
    category: "common",
    dataType: "text",
    source: "system",
    filterable: true,
    columnVisible: false, // sticky title column
    sortable: true,
    groupable: false,
    exportable: true,
    gigsqlField: "title",
    gigsqlValueKind: "text",
    viewFilterField: "title",
  },
  {
    key: "status",
    label: "Status",
    category: "workflow",
    dataType: "select",
    source: "system",
    filterable: true,
    common: true,
    columnVisible: true,
    columnKey: "status",
    sortable: true,
    groupable: true,
    exportable: true,
    gigsqlField: "status",
    gigsqlValueKind: "select",
    viewFilterField: "status",
  },
  {
    key: "type",
    label: "Work type",
    category: "workflow",
    dataType: "select",
    source: "system",
    filterable: true,
    common: true,
    columnVisible: true,
    columnKey: "type",
    sortable: true,
    groupable: true,
    exportable: true,
    gigsqlField: "type",
    gigsqlValueKind: "select",
    // No `viewFilterField`: the saved-View filter_query language has no `type`
    // field, so it stays in-memory/GigsQL only (documented divergence, not a bug).
  },
  {
    key: "priority",
    label: "Priority",
    category: "workflow",
    dataType: "select",
    source: "system",
    filterable: true,
    common: true,
    columnVisible: true,
    columnKey: "priority",
    sortable: true,
    groupable: true,
    exportable: true,
    gigsqlField: "priority",
    gigsqlValueKind: "select",
    viewFilterField: "priority",
  },
  {
    key: "label",
    label: "Labels",
    category: "workflow",
    dataType: "select",
    source: "system",
    filterable: true,
    common: true,
    columnVisible: true,
    columnKey: "label",
    sortable: false,
    groupable: false,
    exportable: true,
    gigsqlField: "label",
    gigsqlValueKind: "select",
    viewFilterField: "label",
  },
  {
    key: "assignee",
    label: "Assignee",
    category: "people",
    dataType: "person",
    source: "system",
    filterable: true,
    common: true,
    columnVisible: true,
    columnKey: "assignee",
    sortable: true,
    groupable: true,
    exportable: true,
    gigsqlField: "assignee",
    gigsqlValueKind: "select",
    viewFilterField: "assignee",
  },
  {
    key: "cycle",
    label: "Cycle",
    category: "planning",
    dataType: "select",
    source: "system",
    filterable: true,
    columnVisible: true,
    columnKey: "cycle",
    sortable: false,
    groupable: false,
    exportable: true,
    gigsqlField: "cycle",
    gigsqlValueKind: "select",
    viewFilterField: "cycle",
  },
  {
    key: "module",
    label: "Module",
    category: "planning",
    dataType: "select",
    source: "system",
    filterable: true,
    columnVisible: true,
    columnKey: "module",
    sortable: false,
    groupable: false,
    exportable: true,
    gigsqlField: "module",
    gigsqlValueKind: "select",
    viewFilterField: "module",
  },
  {
    key: "estimate",
    label: "Estimate",
    category: "planning",
    dataType: "number",
    source: "system",
    filterable: false, // column only in Phase 1; number filter is Phase 2
    columnVisible: true,
    columnKey: "estimate",
    sortable: true,
    groupable: false,
    exportable: true,
  },
  {
    key: "sub_issue",
    label: "Sub-items",
    category: "hierarchy",
    dataType: "count",
    source: "computed",
    filterable: false,
    columnVisible: true,
    columnKey: "sub_issue",
    sortable: true,
    groupable: false,
    exportable: true,
  },
  {
    key: "start_date",
    label: "Start date",
    category: "dates",
    dataType: "date",
    source: "system",
    filterable: false, // GigsQL-valid but no toolbar range editor yet (Phase 2)
    columnVisible: true,
    columnKey: "start_date",
    sortable: true,
    groupable: false,
    exportable: true,
    gigsqlField: "startDate",
    gigsqlValueKind: "date",
  },
  {
    key: "target_date",
    label: "Due date",
    category: "dates",
    dataType: "date",
    source: "system",
    filterable: true,
    columnVisible: true,
    columnKey: "target_date",
    sortable: true,
    groupable: false,
    exportable: true,
    gigsqlField: "dueDate",
    gigsqlValueKind: "date",
    viewFilterField: "due",
  },
  {
    key: "created_at",
    label: "Created date",
    category: "dates",
    dataType: "date",
    source: "system",
    filterable: true,
    columnVisible: true,
    columnKey: "created_at",
    sortable: true,
    groupable: false,
    exportable: true,
    gigsqlField: "createdAt",
    gigsqlValueKind: "date",
    viewFilterField: "created",
  },
  {
    key: "updated_at",
    label: "Updated date",
    category: "dates",
    dataType: "date",
    source: "system",
    filterable: false, // GigsQL-valid; no toolbar range editor yet (Phase 2)
    columnVisible: true,
    columnKey: "updated_at",
    sortable: true,
    groupable: false,
    exportable: true,
    gigsqlField: "updatedAt",
    gigsqlValueKind: "date",
  },
];

export const WORK_ITEM_FIELDS: WorkItemFieldDefinition[] = FIELD_SEEDS.map((f) => ({
  ...f,
  filterOperators: OPERATORS_BY_TYPE[f.dataType],
}));

const BY_KEY = new Map(WORK_ITEM_FIELDS.map((f) => [f.key, f]));

/** Look up a field definition by its canonical key. */
export function fieldByKey(key: string): WorkItemFieldDefinition | undefined {
  return BY_KEY.get(key);
}

/** Fields eligible for the "Add field" filter selector, in category order. */
export function filterableFields(): WorkItemFieldDefinition[] {
  return WORK_ITEM_FIELDS.filter((f) => f.filterable);
}

/** Fields that can be shown as spreadsheet columns (excludes the sticky title). */
export function columnFields(): WorkItemFieldDefinition[] {
  return WORK_ITEM_FIELDS.filter((f) => f.columnVisible && f.columnKey);
}

// --- Derived consumer views: the single source each hard-coded list now imports.

/** GigsQL field-name sets (`gigsql.ts` derives its validators from these). */
export function gigsqlFieldSets(): {
  all: Set<string>;
  select: Set<string>;
  text: Set<string>;
  date: Set<string>;
} {
  const all = new Set<string>();
  const select = new Set<string>();
  const text = new Set<string>();
  const date = new Set<string>();
  for (const f of WORK_ITEM_FIELDS) {
    if (!f.gigsqlField) continue;
    all.add(f.gigsqlField);
    if (f.gigsqlValueKind === "select") select.add(f.gigsqlField);
    else if (f.gigsqlValueKind === "text") text.add(f.gigsqlField);
    else if (f.gigsqlValueKind === "date") date.add(f.gigsqlField);
  }
  return { all, select, text, date };
}

/** Colon-shorthand alias → canonical GigsQL field (e.g. `due` → `dueDate`). */
export function gigsqlColonAliases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of WORK_ITEM_FIELDS) {
    if (f.viewFilterField && f.gigsqlField && f.viewFilterField !== f.gigsqlField) {
      out[f.viewFilterField] = f.gigsqlField;
    }
  }
  return out;
}

/** Saved-View `filter_query` colon fields (`filter-query.ts` derives its allow-list). */
export function viewFilterFields(): string[] {
  return WORK_ITEM_FIELDS.flatMap((f) => (f.viewFilterField ? [f.viewFilterField] : []));
}
