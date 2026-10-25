"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useIssuesSelectionStore } from "@/store/ui/issues-selection.store";

/** Checkbox column for list multi-select (visible on hover or when selected). */
export function IssueRowCheckbox({
  storyId,
  orderedIds,
}: {
  storyId: string;
  orderedIds: string[];
}) {
  const selectedIds = useIssuesSelectionStore((s) => s.selectedIds);
  const selectAt = useIssuesSelectionStore((s) => s.selectAt);
  const checked = selectedIds.includes(storyId);

  return (
    <Checkbox
      checked={checked}
      aria-label={checked ? "Deselect work item" : "Select work item"}
      className={cn(
        "relative z-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100 data-[state=checked]:opacity-100",
        checked && "opacity-100",
      )}
      onPointerDown={(e) => {
        e.stopPropagation();
        selectAt(storyId, orderedIds, e.shiftKey);
      }}
    />
  );
}
