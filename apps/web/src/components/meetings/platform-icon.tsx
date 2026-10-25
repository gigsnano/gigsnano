import { HugeiconsIcon } from "@hugeicons/react";
import { Video01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { EMeetingPlatform } from "@/types";

export const PLATFORM_LABEL: Record<EMeetingPlatform, string> = {
  [EMeetingPlatform.GoogleMeet]: "Google Meet",
  [EMeetingPlatform.Teams]: "Microsoft Teams",
  [EMeetingPlatform.Zoom]: "Zoom",
};

/** Token-derived tint per platform — the glyph itself never changes, only the color. */
const PLATFORM_TONE: Record<EMeetingPlatform, string> = {
  [EMeetingPlatform.GoogleMeet]: "text-emerald-600 dark:text-emerald-400",
  [EMeetingPlatform.Teams]: "text-indigo-600 dark:text-indigo-400",
  [EMeetingPlatform.Zoom]: "text-sky-600 dark:text-sky-400",
};

/** Small rounded tile carrying a platform-tinted glyph. No letters — the tint plus
 * the aria-label is the only distinction, so it reads fine at a glance in a dense list. */
export function PlatformIcon({
  platform,
  className,
}: {
  platform: EMeetingPlatform;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={PLATFORM_LABEL[platform]}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted",
        PLATFORM_TONE[platform],
        className,
      )}
    >
      <HugeiconsIcon icon={Video01Icon} className="size-4" aria-hidden />
    </span>
  );
}
