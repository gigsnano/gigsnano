import { cn } from "@/lib/utils";

/**
 * Initials avatar with optional presence dot (emerald = the repo's positive
 * status color, matching story-meta done states).
 */
export function AvatarCircle({
  name,
  availableNow = false,
  size = "md",
  className,
}: {
  name: string;
  availableNow?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
          size === "lg" ? "size-20 text-xl" : "size-12 text-sm",
        )}
      >
        {initials}
      </span>
      {availableNow && (
        <span
          title="Available now"
          className={cn(
            "absolute rounded-full border-2 border-background bg-emerald-500",
            size === "lg" ? "right-1 top-1 size-4" : "right-0 top-0 size-3",
          )}
        />
      )}
    </span>
  );
}
