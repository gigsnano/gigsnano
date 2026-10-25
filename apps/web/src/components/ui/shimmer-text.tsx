import { cn } from "@/lib/utils";

/**
 * Loops a highlight band across muted text (transitions.dev shimmer, pure CSS).
 * `text` is duplicated into `data-text` so the ::before layer can clip the
 * gradient onto the same glyphs — pass a plain string, not nodes.
 */
export function ShimmerText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={cn("t-shimmer", className)} data-text={text}>
      {text}
    </span>
  );
}
