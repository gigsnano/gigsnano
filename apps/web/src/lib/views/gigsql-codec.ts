import {
  EMPTY_ISSUE_FILTERS,
  type IIssueFilters,
  type TSelectFacetKey,
} from "@/store/ui/issues-view.store";
import { EStoryPriority, EStoryStatus, EStoryType } from "@/types";

import {
  normalizeGigsql,
  parseGigsql,
  rejectCodeAnalysisDomain,
  type IGigsQLBetween,
  type IGigsQLIn,
  type IGigsQLPredicate,
  type TGigsQLNode,
} from "./gigsql";

/** One visual-builder row (AND-joined predicates). */
export interface IFilterRow {
  id: string;
  field: string;
  operator: string;
  value: string;
}

function encodeDateField(from: string | null, to: string | null): string | null {
  if (from && to) return from === to ? from : `${from}..${to}`;
  if (from) return from;
  if (to) return to;
  return null;
}

/** Build GIN-166 colon shorthand from toolbar/column filter state. */
function filtersToColonShorthand(filters: IIssueFilters): string {
  const terms: string[] = [];

  for (const v of filters.status) terms.push(`status:${v}`);
  for (const v of filters.priority) terms.push(`priority:${v}`);
  // `type` (like custom facets) is store-only in v1: it filters in-memory via
  // filterStories and does NOT serialize to GigsQL — the View filter_query
  // language + backend have no `type` field, so encoding it would make a saved
  // View unparseable. Keep it out until type lands in the query language.
  for (const v of filters.assignee) terms.push(`assignee:${v}`);
  for (const v of filters.label) terms.push(`label:${v}`);
  for (const v of filters.cycle) terms.push(`cycle:${v}`);
  for (const v of filters.module) terms.push(`module:${v}`);

  const title = filters.title.trim();
  if (title) terms.push(`title:${title}`);

  const due = encodeDateField(filters.dueFrom, filters.dueTo);
  if (due) terms.push(`due:${due}`);

  const created = encodeDateField(filters.createdFrom, filters.createdTo);
  if (created) terms.push(`created:${created}`);

  return terms.join(" ");
}

/** Serialize toolbar/column filter state to canonical GigsQL. */
export function filtersToGigsql(filters: IIssueFilters): string {
  const colon = filtersToColonShorthand(filters);
  if (!colon) return "";
  const normalized = normalizeGigsql(colon);
  return normalized.kind === "ok" ? normalized.query : "";
}

function applySelectValues(
  filters: IIssueFilters,
  field: TSelectFacetKey,
  values: string[],
): IIssueFilters {
  switch (field) {
    case "status":
      return { ...filters, status: [...new Set([...filters.status, ...(values as EStoryStatus[])])] };
    case "priority":
      return {
        ...filters,
        priority: [...new Set([...filters.priority, ...(values as EStoryPriority[])])],
      };
    case "assignee":
      return { ...filters, assignee: [...new Set([...filters.assignee, ...values])] };
    case "label":
      return { ...filters, label: [...new Set([...filters.label, ...values])] };
    case "type":
      return { ...filters, type: [...new Set([...filters.type, ...(values as EStoryType[])])] };
    case "cycle":
      return { ...filters, cycle: [...new Set([...filters.cycle, ...values])] };
    case "module":
      return { ...filters, module: [...new Set([...filters.module, ...values])] };
  }
}

function applyPredicate(filters: IIssueFilters, node: IGigsQLPredicate): IIssueFilters | null {
  const { field, operator, value } = node;

  if (field === "title" && operator === "~") {
    return { ...filters, title: value };
  }

  if (field === "dueDate" && operator === "=") {
    return { ...filters, dueFrom: value, dueTo: null };
  }
  if (field === "createdAt" && operator === "=") {
    return { ...filters, createdFrom: value, createdTo: null };
  }

  if (
    (field === "status" ||
      field === "priority" ||
      field === "assignee" ||
      field === "label" ||
      field === "type" ||
      field === "cycle" ||
      field === "module") &&
    operator === "="
  ) {
    return applySelectValues(filters, field, [value]);
  }

  return null;
}

function applyIn(filters: IIssueFilters, node: IGigsQLIn): IIssueFilters | null {
  if (node.negated) return null;
  if (
    node.field === "status" ||
    node.field === "priority" ||
    node.field === "assignee" ||
    node.field === "label" ||
    node.field === "type" ||
    node.field === "cycle" ||
    node.field === "module"
  ) {
    return applySelectValues(filters, node.field, node.values);
  }
  return null;
}

function applyBetween(filters: IIssueFilters, node: IGigsQLBetween): IIssueFilters | null {
  if (node.field === "dueDate") {
    return { ...filters, dueFrom: node.start, dueTo: node.end };
  }
  if (node.field === "createdAt") {
    return { ...filters, createdFrom: node.start, createdTo: node.end };
  }
  return null;
}

function astToFilters(node: TGigsQLNode, base: IIssueFilters): IIssueFilters | null {
  if (node.kind === "logical") {
    if (node.operator !== "AND") return null;
    let filters = base;
    for (const child of node.children) {
      const next = astToFilters(child, filters);
      if (next === null) return null;
      filters = next;
    }
    return filters;
  }

  if (node.kind === "predicate") return applyPredicate(base, node);
  if (node.kind === "in") return applyIn(base, node);
  if (node.kind === "between") return applyBetween(base, node);
  return null;
}

/** Parse GigsQL into filter state. Returns null when the query is unsupported. */
export function gigsqlToFilters(query: string): IIssueFilters | null {
  const parsed = parseGigsql(query);
  if (parsed.kind === "empty") return { ...EMPTY_ISSUE_FILTERS };
  if (parsed.kind === "error") return null;

  try {
    rejectCodeAnalysisDomain(parsed.node);
    return astToFilters(parsed.node, { ...EMPTY_ISSUE_FILTERS });
  } catch {
    return null;
  }
}

function nextRowId(rows: IFilterRow[]): string {
  const max = rows.reduce((n, r) => Math.max(n, Number.parseInt(r.id, 10) || 0), 0);
  return String(max + 1);
}

function pushSelectRows(
  rows: IFilterRow[],
  field: "status" | "priority" | "assignee" | "label" | "cycle" | "module",
  values: string[],
): void {
  if (!values.length) return;
  if (values.length === 1) {
    rows.push({ id: nextRowId(rows), field, operator: "=", value: values[0] });
    return;
  }
  rows.push({ id: nextRowId(rows), field, operator: "in", value: values.join(", ") });
}

/** Map toolbar filter state to visual-builder rows. */
export function filtersToRows(filters: IIssueFilters): IFilterRow[] {
  const rows: IFilterRow[] = [];
  pushSelectRows(rows, "status", filters.status);
  pushSelectRows(rows, "priority", filters.priority);
  pushSelectRows(rows, "assignee", filters.assignee);
  pushSelectRows(rows, "label", filters.label);
  pushSelectRows(rows, "cycle", filters.cycle);
  pushSelectRows(rows, "module", filters.module);

  const title = filters.title.trim();
  if (title) rows.push({ id: nextRowId(rows), field: "title", operator: "~", value: title });

  if (filters.dueFrom && filters.dueTo && filters.dueFrom !== filters.dueTo) {
    rows.push({
      id: nextRowId(rows),
      field: "dueDate",
      operator: "between",
      value: `${filters.dueFrom}..${filters.dueTo}`,
    });
  } else if (filters.dueFrom) {
    rows.push({ id: nextRowId(rows), field: "dueDate", operator: "=", value: filters.dueFrom });
  } else if (filters.dueTo) {
    rows.push({ id: nextRowId(rows), field: "dueDate", operator: "=", value: filters.dueTo });
  }

  if (filters.createdFrom && filters.createdTo && filters.createdFrom !== filters.createdTo) {
    rows.push({
      id: nextRowId(rows),
      field: "createdAt",
      operator: "between",
      value: `${filters.createdFrom}..${filters.createdTo}`,
    });
  } else if (filters.createdFrom) {
    rows.push({
      id: nextRowId(rows),
      field: "createdAt",
      operator: "=",
      value: filters.createdFrom,
    });
  } else if (filters.createdTo) {
    rows.push({
      id: nextRowId(rows),
      field: "createdAt",
      operator: "=",
      value: filters.createdTo,
    });
  }

  return rows;
}

function rowToClause(row: IFilterRow): string | null {
  if (!row.field || !row.operator) return null;
  if (row.operator === "is null") return `${row.field} is null`;
  if (row.operator === "in" || row.operator === "not in") {
    const values = row.value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!values.length) return null;
    return `${row.field} ${row.operator} (${values.join(", ")})`;
  }
  if (row.operator === "between") {
    const [start, end] = row.value.split("..").map((v) => v.trim());
    if (!start || !end) return null;
    return `${row.field} between ${start} and ${end}`;
  }
  if (!row.value.trim()) return null;
  return `${row.field} ${row.operator} ${row.value.trim()}`;
}

/** Serialize visual-builder rows to canonical GigsQL. */
export function rowsToGigsql(rows: IFilterRow[]): string {
  const parts = rows.map(rowToClause).filter((p): p is string => Boolean(p));
  if (!parts.length) return "";
  const normalized = normalizeGigsql(parts.join(" AND "));
  return normalized.kind === "ok" ? normalized.query : "";
}

/** Parse GigsQL into visual rows when the query is AND-only and representable. */
export function gigsqlToRows(query: string): IFilterRow[] | null {
  const filters = gigsqlToFilters(query);
  if (!filters) return null;
  return filtersToRows(filters);
}
