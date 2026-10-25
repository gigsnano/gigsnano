import type { ReactNode } from "react";

/** Centered muted message for widget empty/error states. */
export function WidgetMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/** Simple stacked skeleton rows for widget loading states. */
export function WidgetSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1.5 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-7 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
