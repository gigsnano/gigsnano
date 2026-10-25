import type { CodebaseViewId } from "@/types/code/intelligence";

/**
 * The Codebase workspace's views, in tab order — the single runtime list.
 *
 * Both the tab switcher and the `?view=` parser read this. They used to keep
 * separate copies, so adding a view to one and not the other produced a tab that
 * rendered but silently fell back to Overview when clicked (the `?view=` value
 * wasn't in the parser's whitelist). One list, consumed identically.
 *
 * Typed by `CodebaseViewId`, so a view in the union but missing here is at worst a
 * view you can't reach — never a broken one — and an id that isn't in the union
 * won't compile.
 */
export const CODEBASE_VIEWS: readonly { id: CodebaseViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "modules", label: "Modules" },
  { id: "dependencies", label: "Dependencies" },
  { id: "call-flow", label: "Call Flow" },
  { id: "api-flow", label: "API Flow" },
  { id: "data-flow", label: "Data Flow" },
  { id: "schema", label: "Schema" },
  { id: "metrics", label: "Metrics" },
  { id: "issues", label: "Issues" },
];

export const CODEBASE_VIEW_IDS: readonly CodebaseViewId[] = CODEBASE_VIEWS.map((v) => v.id);
