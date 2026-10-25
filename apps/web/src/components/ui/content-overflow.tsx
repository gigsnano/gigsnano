"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Plane-style read-more container. Measures its child; when the content is
 * taller than `maxHeight` it clamps the height, masks the cut-off edge with a
 * gradient fade, and reveals a "Show all" / "Show less" toggle. The height
 * change tweens via the shared `.t-resize` transition.
 *
 * Pass `forceExpanded` (e.g. while an inline editor is focused) to disable the
 * clamp entirely so the content can grow naturally.
 */
export function ContentOverflow({
  maxHeight = 240,
  forceExpanded = false,
  fadeClassName,
  className,
  children,
}: {
  maxHeight?: number;
  forceExpanded?: boolean;
  fadeClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setContentHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A small tolerance stops a 1–2px overflow from showing a pointless toggle.
  const overflows = contentHeight !== null && contentHeight > maxHeight + 8;
  const clamp = overflows && !forceExpanded && !expanded;

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn("t-resize overflow-hidden", forceExpanded && "!transition-none")}
        style={{
          height: clamp
            ? maxHeight
            : forceExpanded
              ? undefined
              : (contentHeight ?? undefined),
        }}
      >
        <div ref={innerRef}>{children}</div>
      </div>

      {clamp ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent",
            fadeClassName,
          )}
        />
      ) : null}

      {overflows && !forceExpanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 inline-flex items-center text-xs font-medium text-primary outline-none transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:underline"
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      ) : null}
    </div>
  );
}
