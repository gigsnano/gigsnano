import { EStoryActivityField } from "@/types";
import type { EStoryPriority, EStoryStatus } from "@/types/story/story";

/** Patch keys a history value can be restored into. Narrow to the update-payload
 * fields the PATCH endpoint accepts; unknown/rich fields (created/link/…) return null. */
export function restorePatch(
  field: EStoryActivityField,
  oldValue: string,
): Record<string, string> | null {
  switch (field) {
    case EStoryActivityField.Description:
      return { description: oldValue };
    case EStoryActivityField.Title:
      return { title: oldValue };
    case EStoryActivityField.Status:
      return { status: oldValue as EStoryStatus };
    case EStoryActivityField.Priority:
      return { priority: oldValue as EStoryPriority };
    case EStoryActivityField.Assignee:
      return { assignee_id: oldValue };
    case EStoryActivityField.Label:
      // Labels are a set whose history stores names, not ids (GIN-475) — there's
      // nothing unambiguous to restore, so offer no one-click undo for them.
      return null;
    case EStoryActivityField.Parent:
      return { parent_id: oldValue };
    case EStoryActivityField.StartDate:
      return { start_date: oldValue };
    case EStoryActivityField.TargetDate:
      return { target_date: oldValue };
    default:
      return null;
  }
}

export function isRestorable(field: EStoryActivityField | null): boolean {
  return field !== null && restorePatch(field, "") !== null;
}
