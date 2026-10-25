import type { TGroupBy } from "@/store/ui/issues-view.store";
import type { IUpdateStoryPayload } from "@/services/story/story.service";
import type { EStoryStatus, EStoryPriority, EStoryType } from "@/types";
import { BMAD_AGENTS } from "@/constants/bmad-agents";

const ROSTER_AGENT_IDS = new Set(BMAD_AGENTS.map((a) => a.id));

/** Ported from Plane's `handleSortOrder` (sparse-midpoint drag ordering). */
export const SORT_ORDER_SPACING = 65535;

/**
 * Computes a story's new `order` when dropped at `destinationIndex` within
 * `orderedIds` (the destination group's id list, post-drop). Drops above/below
 * the group offset by a fixed spacing; drops between two items take the
 * midpoint.
 *
 * ponytail: repeated midpoint splits between the same two neighbors will
 * eventually exhaust float precision. Add a reindex pass (renumber the group
 * by SORT_ORDER_SPACING) only if that ever bites in practice.
 */
export function computeSortOrder(
  orderedIds: string[],
  destinationIndex: number,
  getOrder: (id: string) => number,
): number {
  if (orderedIds.length === 0) return SORT_ORDER_SPACING;
  if (destinationIndex <= 0) return getOrder(orderedIds[0]) - SORT_ORDER_SPACING;
  if (destinationIndex >= orderedIds.length) {
    return getOrder(orderedIds[orderedIds.length - 1]) + SORT_ORDER_SPACING;
  }
  const above = getOrder(orderedIds[destinationIndex - 1]);
  const below = getOrder(orderedIds[destinationIndex]);
  return (above + below) / 2;
}

/** Maps a kanban groupBy to the story field patch a cross-group drag must apply. */
export function groupFieldPatch(groupBy: TGroupBy, groupKey: string): Partial<IUpdateStoryPayload> {
  if (typeof groupBy === "string" && groupBy.startsWith("cf:")) return {}; // reorder only — no custom-field write yet
  switch (groupBy) {
    case "status":
      return { status: groupKey as EStoryStatus };
    case "priority":
      return { priority: groupKey as EStoryPriority };
    case "type":
      return { type: groupKey as EStoryType };
    case "assignee":
      if (groupKey === "unassigned") return { assignee_id: null, ai_agent_id: null };
      if (ROSTER_AGENT_IDS.has(groupKey)) return { ai_agent_id: groupKey, assignee_id: null };
      if (groupKey.startsWith("agent:")) return {}; // workflow-derived key, not a real roster id — reorder only
      return { assignee_id: groupKey, ai_agent_id: null };
    case "none":
    default:
      return {};
  }
}
