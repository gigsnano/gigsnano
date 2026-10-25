import { ISSUES_PAGE_SIZE } from "@/services/story/story.service";
import type { EStoryPriority, EStoryType, IStoryFilters } from "@/types";
import type { EIssueLayout, ISortLevel, IIssueFilters } from "@/store/ui/issues-view.store";
import { filtersToGigsql } from "@/lib/views/gigsql-codec";
import { normalizeGigsql, parseGigsql } from "@/lib/views/gigsql";

export interface IIssuesScopeOptions {
  cycleId?: string;
  moduleId?: string;
  layout: EIssueLayout;
  sort: readonly ISortLevel[];
  filters: IIssueFilters;
  /** Canonical GigsQL from the filter editor; takes precedence over derived filters. */
  gigsqlQuery?: string;
  /** Visible calendar month as `YYYY-MM`. Accepted for call-site symmetry;
   *  unused since the calendar became a full-fetch layout. */
  calendarMonthKey?: string | null;
  limit?: number;
  offset?: number;
}

/**
 * The API's field name for a sort key, or null when it has no server-side
 * equivalent. Keys the backend can't order by are simply dropped rather than
 * sent and silently ignored.
 */
const API_SORT_FIELD: Partial<Record<ISortLevel["key"], string>> = {
  created: "created_at",
  updated: "updated_at",
  priority: "priority",
  due: "target_date",
  start: "start_date",
  title: "title",
};

/**
 * Encode the sort levels the way the API reads them: a comma-separated list of
 * fields, `-` prefixed for descending. Same shape Plane uses.
 *
 * An empty sort is Manual, which is the stored `order` — that is what the
 * backend's own `"manual"` means, so it stays the fallback.
 */
export function apiOrderBy(sort: readonly ISortLevel[]): string {
  const encoded = sort.flatMap((level) => {
    const field = API_SORT_FIELD[level.key];
    return field ? [level.dir === "desc" ? `-${field}` : field] : [];
  });
  return encoded.length ? encoded.join(",") : "manual";
}

/** Map Work Items UI state → API query filters for paginated project story lists. */
export function toStoryApiFilters(opts: IIssuesScopeOptions): IStoryFilters {
  const {
    filters,
    layout,
    sort,
    cycleId,
    moduleId,
    limit,
    offset,
    gigsqlQuery,
  } = opts;

  const api: IStoryFilters = {
    product_only: true,
    limit: limit ?? ISSUES_PAGE_SIZE,
    offset: offset ?? 0,
    order_by: apiOrderBy(sort),
  };

  if (cycleId) api.cycle_id = cycleId;
  if (moduleId) api.module_id = moduleId;

  const candidate = (gigsqlQuery ?? "").trim() || filtersToGigsql(filters);
  const gigsql =
    candidate && parseGigsql(candidate).kind === "ok"
      ? (() => {
          const normalized = normalizeGigsql(candidate);
          return normalized.kind === "ok" ? normalized.query : candidate;
        })()
      : "";
  if (gigsql) {
    api.gigsql = gigsql;
  } else {
    if (filters.status.length === 1) api.status = filters.status[0];
    else if (filters.status.length > 1) api.status_in = filters.status;

    if (filters.priority.length > 0) api.priority_in = filters.priority as EStoryPriority[];
    if (filters.type.length > 0) api.type_in = filters.type as EStoryType[];

    const assignees = filters.assignee.filter((id) => id !== "unassigned");
    if (filters.assignee.includes("unassigned") && assignees.length === 0) {
      api.unassigned_only = true;
    } else if (assignees.length === 1) {
      api.assignee_id = assignees[0];
    }

    const labels = filters.label.filter((id) => id !== "none");
    if (labels.length === 1) api.label_id = labels[0];
  }

  // Plane timeline uses `showAllBlocks` — every work item appears (undated rows
  // get click-to-schedule). Do NOT filter gantt to scheduled_only. (Since
  // GIN-119 gantt takes the full-fetch path anyway and never reaches here.)
  // No calendar branch: it is a full-fetch layout now, so it filters and places
  // client-side like the other four. The old branch scoped the query by
  // target_date, which is also what made a start-date basis impossible.

  return api;
}

/** Full in-memory fetch is only needed when scoped to a sprint/cycle (bounded dataset). */
export function isBoundedIssuesScope(cycleId?: string): boolean {
  return Boolean(cycleId);
}

/**
 * Layouts that need the COMPLETE story set rather than one server page.
 *
 * List/Kanban/Spreadsheet group and sort entirely client-side, which is only
 * correct over every row — a server page yields incomplete groups and a sort
 * that reorders one arbitrary page. Gantt joined them in GIN-119: it virtualises
 * rows instead of paginating, so the whole backlog lands on one timeline (and
 * being on this path is what removes its pagination footer — the footer only
 * renders when `pagination` is non-null).
 *
 * Calendar deliberately stays paged: it scopes to the visible month server-side,
 * which is a real bound rather than an arbitrary page cut.
 */
export function isFullFetchLayout(layout: EIssueLayout): boolean {
  return (
    layout === "list" ||
    layout === "kanban" ||
    layout === "spreadsheet" ||
    layout === "gantt" ||
    // Calendar joined them: placing items by due date, start date or a span is
    // a client-side decision, and the API has no start-date range filter to
    // ask with. Fetching the set removes the backend dependency entirely and
    // retires the one paginated layout.
    layout === "calendar"
  );
}
