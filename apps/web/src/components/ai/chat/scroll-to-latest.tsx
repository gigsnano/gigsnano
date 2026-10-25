"use client";

import { useThreadViewport } from "@assistant-ui/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

/**
 * Jump-to-latest pill. The thread viewport only auto-scrolls while the user is
 * already at the bottom — deliberate on assistant-ui's part, since yanking
 * someone back mid-read is worse than a stale view. This gives them the way
 * back (GIN-476). Renders nothing when already at the bottom.
 *
 * Must be rendered inside `ThreadPrimitive.Root`, positioned over the bottom of
 * the message viewport.
 */
export function ScrollToLatest() {
  const isAtBottom = useThreadViewport((s) => s.isAtBottom);
  const scrollToBottom = useThreadViewport((s) => s.scrollToBottom);

  if (isAtBottom) return null;

  return (
    <button
      type="button"
      onClick={() => scrollToBottom({ behavior: "smooth" })}
      className="absolute inset-x-0 bottom-2 z-10 mx-auto flex w-fit items-center gap-1.5 rounded-full border bg-popover px-3 py-1.5 text-xs font-medium text-foreground shadow-md transition-transform duration-150 ease-out hover:bg-muted active:scale-[0.97] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1"
    >
      <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
      Jump to latest
    </button>
  );
}
