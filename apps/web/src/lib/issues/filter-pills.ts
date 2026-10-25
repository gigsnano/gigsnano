import { gigsqlToFilters } from "@/lib/views/gigsql-codec";
import { parseGigsql } from "@/lib/views/gigsql";
import type { IIssueFilters } from "@/store/ui/issues-view.store";

export type TFilterPillId =
  | "gigsql"
  | "status"
  | "priority"
  | "assignee"
  | "label"
  | "type"
  | "cycle"
  | "module"
  | "title"
  | "due"
  | "created"
  | `custom:${string}`;

export interface IFilterPill {
  id: TFilterPillId;
  label: string;
}

function facetLabel(name: string, count: number): string {
  return count > 1 ? `${name} (${count})` : name;
}

function dateRangeLabel(name: string, from: string | null, to: string | null): string {
  if (from && to) return from === to ? `${name}: ${from}` : `${name}: ${from} – ${to}`;
  if (from) return `${name}: from ${from}`;
  if (to) return `${name}: until ${to}`;
  return name;
}

const GIGSQL_LABEL_MAX = 48;

/** Compact label for a non-decomposable GigsQL expression pill. */
export function compactGigsqlLabel(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length <= GIGSQL_LABEL_MAX) return trimmed;
  return `${trimmed.slice(0, GIGSQL_LABEL_MAX - 1)}…`;
}

function buildFacetPills(filters: IIssueFilters): IFilterPill[] {
  const pills: IFilterPill[] = [];

  if (filters.status.length) {
    pills.push({ id: "status", label: facetLabel("Status", filters.status.length) });
  }
  if (filters.priority.length) {
    pills.push({ id: "priority", label: facetLabel("Priority", filters.priority.length) });
  }
  if (filters.assignee.length) {
    pills.push({ id: "assignee", label: facetLabel("Assignee", filters.assignee.length) });
  }
  if (filters.label.length) {
    pills.push({ id: "label", label: facetLabel("Label", filters.label.length) });
  }
  if (filters.type.length) {
    pills.push({ id: "type", label: facetLabel("Type", filters.type.length) });
  }
  if (filters.cycle.length) {
    pills.push({ id: "cycle", label: facetLabel("Cycle", filters.cycle.length) });
  }
  if (filters.module.length) {
    pills.push({ id: "module", label: facetLabel("Module", filters.module.length) });
  }

  const title = filters.title.trim();
  if (title) {
    pills.push({ id: "title", label: `Work item: ${title}` });
  }

  if (filters.dueFrom || filters.dueTo) {
    pills.push({
      id: "due",
      label: dateRangeLabel("Due date", filters.dueFrom, filters.dueTo),
    });
  }

  if (filters.createdFrom || filters.createdTo) {
    pills.push({
      id: "created",
      label: dateRangeLabel("Created", filters.createdFrom, filters.createdTo),
    });
  }

  for (const [fieldId, values] of Object.entries(filters.custom ?? {})) {
    if (values.length) {
      pills.push({
        id: `custom:${fieldId}`,
        label: facetLabel(fieldId, values.length),
      });
    }
  }

  return pills;
}

/**
 * Derive removable filter pills. Simple AND-only queries become facet pills;
 * complex expressions collapse to one GigsQL pill so removal stays meaningful.
 */
export function buildFilterPills(filters: IIssueFilters, gigsqlQuery = ""): IFilterPill[] {
  const query = gigsqlQuery.trim();
  if (query) {
    const parsed = gigsqlToFilters(query);
    if (parsed) return buildFacetPills(parsed);
    if (parseGigsql(query).kind === "ok") {
      return [{ id: "gigsql", label: compactGigsqlLabel(query) }];
    }
  }
  return buildFacetPills(filters);
}
