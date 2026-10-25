"use client";

import { useRef, useState } from "react";

import {
  GANTT_MIN_BACKLOG,
  GANTT_MIN_TIMELINE,
  clampTimelineHeight,
} from "@/lib/gantt/splitter-geometry";

/**
 * The draggable divider between the timeline and the unscheduled backlog. It is
 * a real `separator` widget, not a decorative bar: pointer-drag, arrow keys, and
 * Home/End all move it, so the split is reachable without a mouse.
 *
 * Pointer capture is set on press so the drag survives the cursor leaving the
 * 10px strip — without it, a fast drag detaches and the divider stops following.
 */
export function GanttSplitter({
  height,
  available,
  onResize,
}: {
  height: number;
  available: number;
  onResize: (next: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ y: 0, height: 0 });

  const nudge = (delta: number) => onResize(clampTimelineHeight(height + delta, available));

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the timeline and unscheduled list"
      aria-valuenow={Math.round(height)}
      aria-valuemin={GANTT_MIN_TIMELINE}
      aria-valuemax={Math.max(GANTT_MIN_TIMELINE, available - GANTT_MIN_BACKLOG)}
      tabIndex={0}
      data-dragging={dragging}
      className="gn-gantt-splitter"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = { y: e.clientY, height };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        onResize(
          clampTimelineHeight(origin.current.height + (e.clientY - origin.current.y), available),
        );
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      // The one cleanup path. `lostpointercapture` fires on an explicit release
      // AND on every interruption the browser forces (scroll takeover, app
      // switch, orientation change) — ending the drag only on pointer-up left it
      // stuck "active" after any of those, with the divider still tracking the
      // pointer the next time it moved.
      onLostPointerCapture={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        // Shift = coarse (48px) so a long drag isn't 40 keypresses.
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowUp") nudge(-step);
        else if (e.key === "ArrowDown") nudge(step);
        else if (e.key === "Home") onResize(GANTT_MIN_TIMELINE);
        else if (e.key === "End") onResize(clampTimelineHeight(available, available));
        else return;
        e.preventDefault();
      }}
    />
  );
}
