"use client";

import { useRef, useState, type PointerEvent } from "react";

export interface IColumnResize {
  /** Live width: the in-drag value while resizing, else the committed width. */
  width: number;
  /** True while a drag is in progress (so the header can suppress reorder DnD). */
  resizing: boolean;
  handlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  };
}

/**
 * Pointer-driven column resize. Tracks a live width during the drag (so the
 * column follows the cursor without persisting on every move) and commits the
 * final width on release. Clamps to `minWidth`. Shared by the property columns
 * and the sticky title column.
 */
export function useColumnResize(
  width: number,
  minWidth: number,
  onCommit: (width: number) => void,
): IColumnResize {
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startWidth.current = width;
    setDragWidth(width);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (dragWidth == null) return;
    const next = startWidth.current + (e.clientX - startX.current);
    setDragWidth(Math.max(next, minWidth));
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (dragWidth == null) return;
    onCommit(dragWidth);
    setDragWidth(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return {
    width: dragWidth ?? width,
    resizing: dragWidth != null,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
