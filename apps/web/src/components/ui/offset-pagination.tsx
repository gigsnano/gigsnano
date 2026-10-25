"use client";

import { Button } from "@/components/ui/button";
import {
  canOffsetPageNext,
  canOffsetPagePrev,
  nextOffsetPage,
  offsetPageWindow,
  prevOffsetPage,
  type TOffsetPageSlice,
} from "@/lib/pagination/offset-page";
import { cn } from "@/lib/utils";

/** Plane-style offset pagination — window label + Prev/Next (no page animation). */
export function OffsetPagination({
  offset,
  limit,
  total,
  onOffsetChange,
  className,
  size = "xs",
}: TOffsetPageSlice & {
  onOffsetChange: (offset: number) => void;
  className?: string;
  size?: "xs" | "sm";
}) {
  const slice = { offset, limit, total };
  const canPrev = canOffsetPagePrev(offset);
  const canNext = canOffsetPageNext(slice);

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span className="tabular-nums">{offsetPageWindow(slice)}</span>
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled={!canPrev}
        onClick={() => onOffsetChange(prevOffsetPage(slice))}
      >
        Prev
      </Button>
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled={!canNext}
        onClick={() => onOffsetChange(nextOffsetPage(slice))}
      >
        Next
      </Button>
    </div>
  );
}
