import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, CheckmarkCircle02Icon, Loading03Icon } from "@hugeicons/core-free-icons";

import { MEETING_STATUS_META } from "@/lib/meetings/meeting-status";
import { cn } from "@/lib/utils";
import type { EMeetingStatus } from "@/types";

const TONE_CLASS: Record<string, string> = {
  active: "bg-muted text-muted-foreground",
  live: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  done: "bg-muted text-muted-foreground",
  failed: "bg-destructive/10 text-destructive",
};

/** Status as icon/dot + word (mirrors `RunStateBadge`, GIN meetings). Word always
 * accompanies the glyph — color alone isn't a reliable channel. */
export function MeetingStatusPill({
  status,
  className,
}: {
  status: EMeetingStatus;
  className?: string;
}) {
  const meta = MEETING_STATUS_META[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONE_CLASS[meta.tone],
        className,
      )}
    >
      {meta.tone === "active" ? (
        <HugeiconsIcon
          icon={Loading03Icon}
          className="size-3 motion-safe:animate-spin"
          aria-hidden
        />
      ) : meta.tone === "live" ? (
        <span className="size-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden />
      ) : meta.tone === "done" ? (
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" aria-hidden />
      ) : (
        <HugeiconsIcon icon={AlertCircleIcon} className="size-3" aria-hidden />
      )}
      {meta.label}
    </span>
  );
}
