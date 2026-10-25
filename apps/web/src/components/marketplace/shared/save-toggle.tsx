"use client";

import { useIsClient } from "@/hooks/ui/use-is-client";

import { cn } from "@/lib/utils";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

/**
 * Heart save toggle for job listings. Saved ids live in the marketplace
 * profile store. Pop on activate follows the button-press rules (subtle
 * scale, ease-out, interruptible transition — not keyframes).
 */
export function SaveToggle({ jobId, className }: { jobId: string; className?: string }) {
  const saved = useMarketplaceProfileStore((s) => s.saved_job_ids.includes(jobId));
  const toggleSavedJob = useMarketplaceProfileStore((s) => s.toggleSavedJob);
  const mounted = useIsClient();
  const isSaved = mounted && saved;

  return (
    <button
      type="button"
      aria-pressed={isSaved}
      aria-label={isSaved ? "Remove from saved jobs" : "Save job"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleSavedJob(jobId);
      }}
      className={cn(
        "flex size-9 items-center justify-center rounded-full border bg-background transition-[transform,color,border-color] duration-150 ease-out",
        "hover:border-primary/50 hover:text-primary active:scale-90",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        isSaved ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      <HeartIcon filled={isSaved} />
    </button>
  );
}
