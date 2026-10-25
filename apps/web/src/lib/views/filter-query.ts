/**
 * Saved-view `filter_query` field vocabulary (GigsQL, GIN-166/175/311).
 *
 * The backend-mirrored allow-list of colon-shorthand fields a saved view can
 * name, kept in step with `gigsnano_api/features/views/filter_query.py`.
 *
 * Validation and application of a saved view now run through the full GigsQL
 * grammar — `validate-gigsql.ts` (dialogs) and `gigsqlToFilters` + `filterStories`
 * (application), see GIN-311. This module is only the field list; the canonical
 * Work Item Field Registry (`field-registry.ts`) is pinned to it by
 * `field-registry.test.ts`.
 */

export const VIEW_FILTER_FIELDS = [
  "cycle",
  "module",
  "assignee",
  "status",
  "priority",
  "title",
  "label",
  "due",
  "created",
] as const;

export type TViewFilterField = (typeof VIEW_FILTER_FIELDS)[number];
