import { EStoryStatus, type IStory } from "@/types";

import type { WorkItemTab } from "./work-item-tabs";

/**
 * The one dominant action for the work-item header (GIN-479).
 *
 * Only the states derivable from the work item as it exists today are here.
 * The full table in the GIN-477 spec (`Configure run`, `Start agent run`,
 * `Resolve blocker`, `Review delivery`) needs the delegation field from slice 3
 * and the run state machine from slice 4 — those branches land with them rather
 * than as labels that lie about what pressing them does.
 */
export type WorkItemPrimaryAction =
  | { kind: "assign"; label: string }
  | { kind: "tab"; label: string; tab: WorkItemTab }
  | null;

export function workItemPrimaryAction(story: IStory): WorkItemPrimaryAction {
  // Completed work has no dominant next step — the spec is explicit about not
  // inventing one just to keep the slot filled.
  if (story.status === EStoryStatus.Done) return null;
  if (story.ai_agent_id) return { kind: "tab", label: "View runs", tab: "runs" };
  if (story.assignee_id) return null;
  return { kind: "assign", label: "Assign work" };
}
