"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import { STORY_TYPE_META } from "@/constants/story-meta";
import { EStoryType } from "@/types";

/** A work-item type icon tinted by its type. */
export function TypeGlyph({
  type,
  className,
}: {
  type: EStoryType;
  className?: string;
}) {
  const meta = STORY_TYPE_META[type];
  return (
    <HugeiconsIcon
      icon={meta.icon}
      className={cn("size-4 shrink-0", meta.color, className)}
      aria-label={meta.label}
    />
  );
}
