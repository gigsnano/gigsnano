import { cn } from "@/lib/utils";

function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn("size-3.5", className)} aria-hidden>
      <path d="M10 1.5l2.47 5.29 5.8.62-4.33 3.91 1.2 5.7L10 14.1l-5.14 2.92 1.2-5.7L1.73 7.4l5.8-.62L10 1.5z" />
    </svg>
  );
}

/** 5-star display with partial fill + numeric value. */
export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span
        className="relative inline-flex"
        role="img"
        aria-label={rating > 0 ? `Rated ${rating.toFixed(1)} out of 5` : "No rating yet"}
      >
        <span className="flex text-muted-foreground/30">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} />
          ))}
        </span>
        <span
          className="absolute inset-0 flex overflow-hidden text-primary"
          style={{ width: `${pct}%` }}
          aria-hidden
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className="shrink-0" />
          ))}
        </span>
      </span>
      <span className="text-xs font-medium tabular-nums text-foreground">
        {rating > 0 ? rating.toFixed(1) : "0"}
      </span>
    </span>
  );
}
