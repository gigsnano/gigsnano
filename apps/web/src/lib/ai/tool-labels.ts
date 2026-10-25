/** Friendly copy for the GigsAI agentic tools (`gigsnano-api` `agent/tools/work_items.py`). */
const TOOL_LABELS: Record<string, { running: string; action: string }> = {
  query_work_items: { running: "Searching work items…", action: "search work items" },
  create_work_item: { running: "Creating work item…", action: "create a work item" },
  update_work_item: { running: "Updating work item…", action: "update a work item" },
};

function fallbackLabel(name: string): string {
  return name.replace(/_/g, " ");
}

/** Chip copy while a tool is in flight, e.g. "Searching work items…". */
export function toolRunningLabel(name: string): string {
  return TOOL_LABELS[name]?.running ?? `Running ${fallbackLabel(name)}…`;
}

/** Confirm-card copy, e.g. "create a work item" for "GigsAI wants to …". */
export function toolActionLabel(name: string): string {
  return TOOL_LABELS[name]?.action ?? fallbackLabel(name);
}
