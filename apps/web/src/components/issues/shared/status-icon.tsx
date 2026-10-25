"use client";

import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import { STORY_STATUS_META } from "@/constants/story-meta";
import { EStoryStatus } from "@/types";

/** A status icon tinted by its state. */
export function StatusIcon({
  status,
  className,
}: {
  status: EStoryStatus;
  className?: string;
}) {
  const meta = STORY_STATUS_META[status];
  return (
    <HugeiconsIcon
      icon={meta.icon}
      className={cn("size-4 shrink-0", meta.color, className)}
      aria-label={meta.label}
    />
  );
}
