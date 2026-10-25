import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { EStoryStatus, EStoryPriority, EStoryType } from "@/types";
import type { TGanttZoom } from "@/lib/gantt/gantt-zoom";
import { filtersToGigsql, gigsqlToFilters } from "@/lib/views/gigsql-codec";
import { normalizeGigsql } from "@/lib/views/gigsql";
import {
  DEFAULT_SPREADSHEET_COLUMNS,
  SPREADSHEET_COLUMN_META,
  TITLE_COLUMN,
  type ISpreadsheetColumn,
  type SpreadsheetColumnKey,
} from "@/lib/issues/spreadsheet-columns";
import type { TCalendarBasis } from "@/lib/issues/calendar-placement";
import {
  DESC_BY_DEFAULT,
  MAX_SORT_LEVELS,
  type ISortLevel,
  type TSortKey,
} from "@/lib/issues/story-sort";

/**
 * Which sort key a legacy spreadsheet column carried. Columns with nothing to
 * sort on (labels, links) simply drop — there was never an order to preserve.
 */
const LEGACY_COLUMN_SORT: Partial<Record<string, TSortKey>> = {
  priority: "priority",
  target_date: "due",
  start_date: "start",
  created_at: "created",
  updated_at: "updated",
  title: "title",
  assignee: "assignee",
  status: "status",
  estimate: "estimate",
};

/**
 * Translate the pre-stacked-sort shape into one sort level.
 *
 * Everyone with the app open has an `orderBy` (and possibly a `spreadsheetSort`)
 * in localStorage. Without this they would all silently land on Manual.
 */
function sortFromLegacy(persisted: {
  orderBy?: string;
  spreadsheetSort?: { column: string; dir: "asc" | "desc" } | null;
}): ISortLevel[] {
  const column = persisted.spreadsheetSort?.column;
  const mapped = column ? LEGACY_COLUMN_SORT[column] : undefined;
  if (mapped) return [{ key: mapped, dir: persisted.spreadsheetSort?.dir ?? "asc" }];
  const legacy = persisted.orderBy;
  if (legacy === "priority" || legacy === "created" || legacy === "updated") {
    return [{ key: legacy, dir: "desc" }];
  }
  return [];
}

/** The work-item layouts (Plane-style). `graph` is ours: containment + relation edges
 * as a directed graph (GIN-159). */
export type EIssueLayout = "list" | "kanban" | "calendar" | "spreadsheet" | "gantt" | "graph";

/** How rows are grouped in list/kanban/spreadsheet. */
export type EIssueGroupBy = "status" | "priority" | "assignee" | "type" | "none";

/** Grouping dimension: a built-in facet, or a custom SELECT field (`cf:<fieldId>`). */
export type TGroupBy = EIssueGroupBy | `cf:${string}`;

export type { ISortLevel, TSortKey } from "@/lib/issues/story-sort";

/** Multi-value select facets driven by canonical registry fields. */
export type TSelectFacetKey = "status" | "priority" | "assignee" | "label" | "type" | "cycle" | "module";

export interface IIssueFilters {
  status: EStoryStatus[];
  priority: EStoryPriority[];
  assignee: string[];
  label: string[];
  type: EStoryType[];
  /** Cycle/sprint ids. GigsQL `cycle:`. */
  cycle: string[];
  /** Module/component ids. GigsQL `module:`. */
  module: string[];
  /** Custom SELECT-field facets, keyed by field id → selected values (`"__none__"` = unset). */
  custom: Record<string, string[]>;
  /** Title contains filter (`""` = none). GigsQL `title:` — store-only type/custom stay out of v1. */
  title: string;
  /** Due date (`target_date`) bounds as YYYY-MM-DD. GigsQL `due:`. */
  dueFrom: string | null;
  dueTo: string | null;
  /** Created date bounds as YYYY-MM-DD. GigsQL `created:`. */
  createdFrom: string | null;
  createdTo: string | null;
}

export const EMPTY_ISSUE_FILTERS: IIssueFilters = {
  status: [],
  priority: [],
  assignee: [],
  label: [],
  type: [],
  cycle: [],
  module: [],
  custom: {},
  title: "",
  dueFrom: null,
  dueTo: null,
  createdFrom: null,
  createdTo: null,
};

export interface IIssuesViewStore {
  layout: EIssueLayout;
  groupBy: TGroupBy;
  /** Ordered sort levels, at most `MAX_SORT_LEVELS`. Empty = Manual (drag). */
  sort: ISortLevel[];
  filters: IIssueFilters;
  /** Canonical GigsQL string shared by Visual and text editor modes. */
  gigsqlQuery: string;
  /**
   * When true, sub-items are ordinary rows and cards in every layout. When
   * false they live under their parent's chevron and nowhere else.
   *
   * This is the population rule, not a decoration: it decides what every count
   * in the view adds up to (see `buildIssueTree`).
   */
  showSubIssues: boolean;
  /** Persisted expand state for list + spreadsheet hierarchy chevrons. */
  expandedIssueIds: string[];
  /** Spreadsheet column layout: identity + order + visibility + width. */
  spreadsheetColumns: ISpreadsheetColumn[];
  /** Width of the sticky "Work item" title column (resizable, persisted). */
  spreadsheetTitleWidth: number;
  setLayout: (layout: EIssueLayout) => void;
  setGroupBy: (groupBy: TGroupBy) => void;
  setShowSubIssues: (show: boolean) => void;
  toggleExpanded: (issueId: string) => void;
  /** Append a level, unless it is already sorted on or the cap is reached. */
  addSortLevel: (key: TSortKey) => void;
  setSortLevelKey: (index: number, key: TSortKey) => void;
  flipSortDir: (index: number) => void;
  removeSortLevel: (index: number) => void;
  reorderSortLevels: (from: number, to: number) => void;
  /** Replace the whole list (spreadsheet header click); trimmed to the cap. */
  setSort: (sort: ISortLevel[]) => void;
  clearSort: () => void;
  toggleSpreadsheetColumn: (key: SpreadsheetColumnKey) => void;
  reorderSpreadsheetColumn: (fromKey: SpreadsheetColumnKey, toKey: SpreadsheetColumnKey) => void;
  setSpreadsheetColumnWidth: (key: SpreadsheetColumnKey, width: number) => void;
  setSpreadsheetTitleWidth: (width: number) => void;
  resetSpreadsheetColumns: () => void;
  toggleFilter: (key: TSelectFacetKey, value: string) => void;
  setFilterFacet: (key: TSelectFacetKey, values: string[]) => void;
  setFilterTitle: (title: string) => void;
  setDueRange: (from: string | null, to: string | null) => void;
  setCreatedRange: (from: string | null, to: string | null) => void;
  toggleCustomFilter: (fieldId: string, value: string) => void;
  /** Replace the full filter state (e.g. when loading a saved View's GigsQL). */
  setFilters: (filters: IIssueFilters) => void;
  /** Update the canonical GigsQL string; syncs filters when representable. */
  setGigsqlQuery: (query: string) => void;
  clearFilters: () => void;
  /** Visible calendar month (`YYYY-MM`). Remembers where the reader was; since
   *  the calendar became a full-fetch layout it no longer drives a query. */
  calendarMonthKey: string | null;
  setCalendarMonthKey: (key: string) => void;
  /**
   * Which date puts an item on the calendar.
   *
   * Defaults to `due`, which is exactly the behaviour before this existed, so
   * nobody's calendar changes until they choose. `start` is what makes
   * start-dated work visible at all — the Gantt always drew it, the calendar
   * never did.
   */
  calendarBasis: TCalendarBasis;
  setCalendarBasis: (basis: TCalendarBasis) => void;
  /** Persisted Gantt zoom level (GIN-353) — survives navigation + reload. */
  ganttZoom: TGanttZoom;
  setGanttZoom: (zoom: TGanttZoom) => void;
  /** Persisted Gantt timeline height in px — the splitter above the unscheduled
   *  backlog. Survives navigation + reload so the chosen split isn't re-dragged. */
  ganttTimelineHeight: number;
  setGanttTimelineHeight: (px: number) => void;
}

/** Persisted-state version. Bump when a stored field changes meaning. */
export const ISSUES_VIEW_VERSION = 1;

/**
 * Bring pre-v1 state forward.
 *
 * In v0 `showSubIssues` decided whether a row drew an expand chevron, and BOTH
 * of its values listed roots only — nobody ever saw a sub-item as a top-level
 * row. In v1 the same field decides the population. Taking a stored `true` at
 * face value would flatten a list the user has only ever read as a hierarchy,
 * so every v0 state maps to `false`: exactly what was already on their screen.
 * Choosing flat afterwards is stored at v1 and left alone.
 */
export function migrateIssuesView(persisted: unknown, version: number): unknown {
  if (version >= ISSUES_VIEW_VERSION || !persisted || typeof persisted !== "object") {
    return persisted;
  }
  return { ...(persisted as Record<string, unknown>), showSubIssues: false };
}

/** Deep-merges persisted state onto current defaults so a newly-added `filters` *  facet (e.g. `type`) falls back to its default instead of becoming undefined. */
export function mergePersistedIssuesView(
  persisted: unknown,
  current: IIssuesViewStore,
): IIssuesViewStore {
  const p = (persisted ?? {}) as Partial<IIssuesViewStore>;
  return {
    ...current,
    ...p,
    filters: { ...current.filters, ...(p.filters ?? {}) },
    gigsqlQuery: p.gigsqlQuery ?? current.gigsqlQuery,
    showSubIssues: p.showSubIssues ?? current.showSubIssues,
    expandedIssueIds: p.expandedIssueIds ?? current.expandedIssueIds,
    spreadsheetColumns: mergeSpreadsheetColumns(p.spreadsheetColumns),
    spreadsheetTitleWidth: p.spreadsheetTitleWidth ?? current.spreadsheetTitleWidth,
    sort: p.sort ?? sortFromLegacy(persisted as Parameters<typeof sortFromLegacy>[0]),
    calendarMonthKey: p.calendarMonthKey ?? current.calendarMonthKey,
    // New field with a default — absorbed the same way a new filter facet is,
    // so no version bump and no migration.
    calendarBasis: p.calendarBasis ?? current.calendarBasis,
    ganttZoom: p.ganttZoom ?? current.ganttZoom,
    ganttTimelineHeight: p.ganttTimelineHeight ?? current.ganttTimelineHeight,
  };
}

/**
 * Reconcile the persisted column layout with the current catalog: keep the
 * user's order/visibility/width for known columns, drop removed keys, and
 * append any newly-added column at its default. Guarantees exactly one entry
 * per catalog key so a shipped column never silently disappears.
 */
export function mergeSpreadsheetColumns(
  persisted: ISpreadsheetColumn[] | undefined,
): ISpreadsheetColumn[] {
  if (!persisted?.length) return DEFAULT_SPREADSHEET_COLUMNS;
  const byKey = new Map(persisted.map((c) => [c.key, c]));
  const kept = persisted.filter((c) => c.key in SPREADSHEET_COLUMN_META);
  const missing = DEFAULT_SPREADSHEET_COLUMNS.filter((c) => !byKey.has(c.key));
  return [...kept, ...missing];
}

/** Sync canonical GigsQL from structured filter facets. */
function syncGigsqlFromFilters(filters: IIssueFilters): string {
  return filtersToGigsql(filters);
}

/** Pure UI state for the Work Items page: layout + grouping + filters. */
export const useIssuesViewStore = create<IIssuesViewStore>()(
  persist(
    (set) => ({
      layout: "list",
      groupBy: "status",
      sort: [],
      filters: EMPTY_ISSUE_FILTERS,
      gigsqlQuery: "",
      // Hierarchy by default: a work item is read through its parent, and a
      // board of 200 sub-items buries the 30 things anyone tracks. Flat is a
      // deliberate choice, not something that happens to you.
      showSubIssues: false,
      expandedIssueIds: [],
      spreadsheetColumns: DEFAULT_SPREADSHEET_COLUMNS,
      spreadsheetTitleWidth: TITLE_COLUMN.defaultWidth,
      calendarMonthKey: null,
      calendarBasis: "due",
      setCalendarBasis: (calendarBasis) => set({ calendarBasis }),
      ganttZoom: "week",
      setGanttZoom: (ganttZoom) => set({ ganttZoom }),
      ganttTimelineHeight: 420,
      setGanttTimelineHeight: (ganttTimelineHeight) => set({ ganttTimelineHeight }),
      setLayout: (layout) => set({ layout }),
      setGroupBy: (groupBy) => set({ groupBy }),
      setShowSubIssues: (showSubIssues) => set({ showSubIssues }),
      addSortLevel: (key) =>
        set((s) =>
          s.sort.length >= MAX_SORT_LEVELS || s.sort.some((l) => l.key === key)
            ? s
            : {
                sort: [
                  ...s.sort,
                  { key, dir: DESC_BY_DEFAULT.includes(key) ? "desc" : "asc" },
                ],
              },
        ),
      setSortLevelKey: (index, key) =>
        set((s) => ({
          sort: s.sort.map((l, i) => (i === index ? { ...l, key } : l)),
        })),
      flipSortDir: (index) =>
        set((s) => ({
          sort: s.sort.map((l, i) =>
            i === index ? { ...l, dir: l.dir === "asc" ? "desc" : "asc" } : l,
          ),
        })),
      removeSortLevel: (index) => set((s) => ({ sort: s.sort.filter((_, i) => i !== index) })),
      reorderSortLevels: (from, to) =>
        set((s) => {
          const next = [...s.sort];
          const [moved] = next.splice(from, 1);
          if (!moved) return s;
          next.splice(to, 0, moved);
          return { sort: next };
        }),
      setSort: (sort) => set({ sort: sort.slice(0, MAX_SORT_LEVELS) }),
      clearSort: () => set({ sort: [] }),
      toggleExpanded: (issueId) =>
        set((s) => {
          const open = s.expandedIssueIds.includes(issueId);
          return {
            expandedIssueIds: open
              ? s.expandedIssueIds.filter((id) => id !== issueId)
              : [...s.expandedIssueIds, issueId],
          };
        }),
      toggleSpreadsheetColumn: (key) =>
        set((s) => ({
          spreadsheetColumns: s.spreadsheetColumns.map((c) =>
            c.key === key ? { ...c, visible: !c.visible } : c,
          ),
        })),
      reorderSpreadsheetColumn: (fromKey, toKey) =>
        set((s) => {
          if (fromKey === toKey) return s;
          const cols = [...s.spreadsheetColumns];
          const from = cols.findIndex((c) => c.key === fromKey);
          const to = cols.findIndex((c) => c.key === toKey);
          if (from === -1 || to === -1) return s;
          const [moved] = cols.splice(from, 1);
          if (!moved) return s;
          cols.splice(to, 0, moved);
          return { spreadsheetColumns: cols };
        }),
      setSpreadsheetColumnWidth: (key, width) =>
        set((s) => ({
          spreadsheetColumns: s.spreadsheetColumns.map((c) =>
            c.key === key
              ? { ...c, width: Math.max(width, SPREADSHEET_COLUMN_META[key].minWidth) }
              : c,
          ),
        })),
      setSpreadsheetTitleWidth: (width) =>
        set({ spreadsheetTitleWidth: Math.max(width, TITLE_COLUMN.minWidth) }),
      resetSpreadsheetColumns: () =>
        set({
          spreadsheetColumns: DEFAULT_SPREADSHEET_COLUMNS,
          spreadsheetTitleWidth: TITLE_COLUMN.defaultWidth,
        }),
      toggleFilter: (key, value) =>
        set((s) => {
          const current = s.filters[key] as string[];
          const next = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value];
          const filters = { ...s.filters, [key]: next };
          return { filters, gigsqlQuery: syncGigsqlFromFilters(filters) };
        }),
      setFilterFacet: (key, values) =>
        set((s) => {
          const filters = { ...s.filters, [key]: values };
          return { filters, gigsqlQuery: syncGigsqlFromFilters(filters) };
        }),
      setFilterTitle: (title) =>
        set((s) => {
          const filters = { ...s.filters, title };
          return { filters, gigsqlQuery: syncGigsqlFromFilters(filters) };
        }),
      setDueRange: (dueFrom, dueTo) =>
        set((s) => {
          const filters = { ...s.filters, dueFrom, dueTo };
          return { filters, gigsqlQuery: syncGigsqlFromFilters(filters) };
        }),
      setCreatedRange: (createdFrom, createdTo) =>
        set((s) => {
          const filters = { ...s.filters, createdFrom, createdTo };
          return { filters, gigsqlQuery: syncGigsqlFromFilters(filters) };
        }),
      toggleCustomFilter: (fieldId, value) =>
        set((s) => {
          const current = s.filters.custom[fieldId] ?? [];
          const next = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value];
          const custom = { ...s.filters.custom };
          if (next.length) custom[fieldId] = next;
          else delete custom[fieldId];
          const filters = { ...s.filters, custom };
          return { filters, gigsqlQuery: syncGigsqlFromFilters(filters) };
        }),
      setFilters: (filters) =>
        set({ filters, gigsqlQuery: syncGigsqlFromFilters(filters) }),
      setGigsqlQuery: (query) =>
        set((s) => {
          const trimmed = query.trim();
          const normalized = normalizeGigsql(trimmed);
          const gigsqlQuery = normalized.kind === "ok" ? normalized.query : trimmed;
          const parsed = gigsqlToFilters(gigsqlQuery);
          return {
            gigsqlQuery,
            filters: parsed ?? s.filters,
          };
        }),
      clearFilters: () => set({ filters: EMPTY_ISSUE_FILTERS, gigsqlQuery: "" }),
      setCalendarMonthKey: (calendarMonthKey) => set({ calendarMonthKey }),
    }),
    {
      name: "gn.issues-view",
      version: ISSUES_VIEW_VERSION,
      migrate: migrateIssuesView,
      merge: (persisted, current) => mergePersistedIssuesView(persisted, current as IIssuesViewStore),
    },
  ),
);

/** Total number of active filter values across all facets. */
export function countActiveFilters(filters: IIssueFilters): number {
  return (
    filters.status.length +
    filters.priority.length +
    filters.assignee.length +
    filters.label.length +
    filters.type.length +
    filters.cycle.length +
    filters.module.length +
    Object.values(filters.custom ?? {}).reduce((n, vs) => n + vs.length, 0) +
    (filters.title.trim() ? 1 : 0) +
    (filters.dueFrom || filters.dueTo ? 1 : 0) +
    (filters.createdFrom || filters.createdTo ? 1 : 0)
  );
}
