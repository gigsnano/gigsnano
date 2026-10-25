import { cn } from "@/lib/utils";
import { ETalentBadge } from "@/types";

import { TALENT_BADGE_LABELS } from "./talent-badge-labels";

/** Talent tier chip; Top Rated Plus gets the filled treatment. */
export function TalentBadge({ badge, className }: { badge: ETalentBadge; className?: string }) {
  const plus = badge === ETalentBadge.TopRatedPlus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        plus ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="size-3" aria-hidden>
        <path d="M10 1.5l2.47 5.29 5.8.62-4.33 3.91 1.2 5.7L10 14.1l-5.14 2.92 1.2-5.7L1.73 7.4l5.8-.62L10 1.5z" />
      </svg>
      {TALENT_BADGE_LABELS[badge]}
    </span>
  );
}
