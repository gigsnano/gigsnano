"use client";

import { useRef, useState } from "react";

import { DEFAULT_BLOCK_WIDTH } from "@/components/projects/views/gantt/gantt-config";
import { getTimelineDragPatch } from "@/components/projects/views/gantt/gantt-date-math";

export type TGanttDragMode = "left" | "right" | "move";

const BAR_INSET = 2;

function snap(px: number, dayWidth: number) {
  return Math.round(px / dayWidth) * dayWidth;
}

export type TGanttDatePatch = {
  start_date?: string | null;
  target_date?: string | null;
};

/**
 * Plane-style drag: move only when both dates exist; half-block resize keeps
 * DEFAULT_BLOCK_WIDTH when the opposite date is missing; commit uses one-sided
 * patches unless completing a half-block.
 */
export function useIssuesGanttBarDrag({
  chartStart,
  dayWidth,
  chartLeft,
  chartWidth,
  onCommit,
  hadStart,
  hadTarget,
  enableMove,
}: {
  chartStart: Date;
  dayWidth: number;
  chartLeft: number;
  chartWidth: number;
  onCommit: (patch: TGanttDatePatch) => void;
  hadStart: boolean;
  hadTarget: boolean;
  enableMove: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragMode, setDragMode] = useState<TGanttDragMode | null>(null);
  const [visual, setVisual] = useState({ left: chartLeft + BAR_INSET, width: chartWidth });

  const [prevBounds, setPrevBounds] = useState({ left: chartLeft, width: chartWidth });
  if (prevBounds.left !== chartLeft || prevBounds.width !== chartWidth) {
    setPrevBounds({ left: chartLeft, width: chartWidth });
    setVisual({ left: chartLeft + BAR_INSET, width: chartWidth });
  }

  const startDrag = (e: React.MouseEvent, mode: TGanttDragMode) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0 || !barRef.current) return;
    if (mode === "move" && !enableMove) return;

    const originX = e.clientX;
    const originLeft = visual.left;
    const originWidth = visual.width;
    const minWidth = Math.max(dayWidth - BAR_INSET * 2, 8);
    const halfWidth = DEFAULT_BLOCK_WIDTH;

    setDragMode(mode);
    document.body.style.userSelect = "none";
    document.body.style.cursor = mode === "move" ? "grabbing" : "col-resize";

    const apply = (left: number, width: number) => {
      barRef.current!.style.left = `${left}px`;
      barRef.current!.style.width = `${width}px`;
    };

    const onMove = (ev: MouseEvent) => {
      const delta = snap(ev.clientX - originX, dayWidth);

      if (mode === "move") {
        apply(Math.max(0, originLeft + delta), originWidth);
        return;
      }

      if (mode === "left") {
        // Plane: no target → keep default half-block width while sliding start
        if (!hadTarget) {
          const nextLeft = Math.max(0, originLeft + delta);
          apply(nextLeft, halfWidth);
          return;
        }
        const nextLeft = Math.max(0, originLeft + delta);
        const nextWidth = originWidth - (nextLeft - originLeft);
        if (nextWidth < minWidth) return;
        apply(nextLeft, nextWidth);
        return;
      }

      // right resize
      if (!hadStart) {
        // Plane: no start → keep default width, slide the target
        const nextRight = originLeft + originWidth + delta;
        const nextLeft = Math.max(0, nextRight - halfWidth);
        apply(nextLeft, halfWidth);
        return;
      }
      const nextWidth = Math.max(minWidth, originWidth + delta);
      apply(originLeft, nextWidth);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setDragMode(null);

      if (!barRef.current) return;
      const finalLeft = parseFloat(barRef.current.style.left) - BAR_INSET;
      const finalWidth = parseFloat(barRef.current.style.width) + BAR_INSET * 2;
      setVisual({
        left: parseFloat(barRef.current.style.left),
        width: parseFloat(barRef.current.style.width),
      });

      const patch = getTimelineDragPatch({
        leftPx: Math.max(0, finalLeft),
        widthPx: Math.max(dayWidth, finalWidth),
        chartStart,
        dayWidth,
        hadStart,
        hadTarget,
        dragMode: mode,
      });
      onCommit(patch);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return { barRef, dragMode, visual, startDrag };
}
