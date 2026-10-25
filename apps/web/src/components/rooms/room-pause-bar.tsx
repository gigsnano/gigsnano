"use client";

import { Button } from "@/components/ui/button";

/**
 * Shown after a round settles: a quiet "round complete" divider plus a
 * "Let them continue" control that runs the next round with no human input.
 * Reveals with a gentle fade+zoom (ease-out) so the pause reads as an arrival,
 * not a layout jump.
 */
export function RoomPauseBar({
  visible,
  onContinue,
  pending,
}: {
  visible: boolean;
  onContinue: () => void;
  pending: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="my-3 flex flex-col items-center gap-2 duration-200 ease-out animate-in fade-in-0 zoom-in-95">
      <div className="flex w-full items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        round complete
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onContinue}>
        {pending ? "Thinking…" : "▸ Let them continue"}
      </Button>
    </div>
  );
}
