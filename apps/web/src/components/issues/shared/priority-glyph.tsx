"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import { STORY_PRIORITY_META, UrgentIcon } from "@/constants/story-meta";
import { EStoryPriority } from "@/types";

// Static bar-fill classes (Tailwind can't see runtime-built class names).
const BAR_FILL: Record<EStoryPriority, string> = {
  [EStoryPriority.Urgent]: "bg-red-500",
  [EStoryPriority.High]: "bg-orange-500",
  [EStoryPriority.Medium]: "bg-amber-500",
  [EStoryPriority.Low]: "bg-blue-500",
  [EStoryPriority.None]: "bg-muted-foreground/40",
};

/**
 * Signal-bar priority glyph (Plane-style): ascending bars filled to the
 * priority level; Urgent shows a filled alert square instead.
 */
export function PriorityGlyph({
  priority,
  className,
}: {
  priority: EStoryPriority;
  className?: string;
}) {
  const meta = STORY_PRIORITY_META[priority];

  if (meta.urgent) {
    return (
      <span
        className={cn(
          "flex size-[18px] items-center justify-center rounded-[5px] bg-red-500 text-white",
          className,
        )}
        title="Urgent"
      >
        <HugeiconsIcon icon={UrgentIcon} className="size-3" />
      </span>
    );
  }

  return (
    <span
      className={cn("flex h-[18px] w-[18px] items-end justify-center gap-[2px]", className)}
      title={meta.label}
      aria-label={`Priority: ${meta.label}`}
    >
      {[1, 2, 3].map((level) => (
        <span
          key={level}
          className={cn(
            "w-[3px] rounded-[1px] transition-colors",
            level === 1 ? "h-[6px]" : level === 2 ? "h-[10px]" : "h-[14px]",
            level <= meta.bars ? BAR_FILL[priority] : "bg-muted-foreground/25",
          )}
        />
      ))}
    </span>
  );
}
