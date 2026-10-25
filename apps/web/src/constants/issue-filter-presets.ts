/** A canned filter (Jira's "Saved filters" system presets). */
export interface IIssueFilterPreset {
  id: string;
  label: string;
  /** Canonical GigsQL applied via `setGigsqlQuery` — round-trips into the Visual panel. */
  query: string;
}

/**
 * ponytail: static presets. Written as canonical GigsQL that `gigsqlToFilters`
 * can parse (so they reflect in the Visual panel). "me"/"unassigned" are the
 * store's assignee sentinels. Move to a backend/workspace source if per-team
 * presets are ever needed.
 */
export const ISSUE_FILTER_PRESETS: IIssueFilterPreset[] = [
  { id: "mine", label: "My work items", query: "assignee = me" },
  { id: "unassigned", label: "Unassigned", query: "assignee = unassigned" },
  { id: "high-priority", label: "High priority", query: "priority in (urgent, high)" },
  { id: "active", label: "Active work", query: "status in (todo, in_progress, in_review)" },
  { id: "completed", label: "Completed", query: "status = done" },
];
