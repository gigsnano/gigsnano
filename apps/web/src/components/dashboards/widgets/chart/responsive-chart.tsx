"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  CHART_MARGIN,
  COMPACT_BELOW,
  COMPACT_MARGIN,
  PX_PER_TICK,
  RESIZE_SETTLE_MS,
} from "./chart-layout";

export interface IChartBox {
  width: number;
  height: number;
  /** Too short for the axis strip and legend — draw the plot alone. */
  compact: boolean;
  /** Date ticks that fit the current width, never fewer than a domain needs. */
  numTicks: number;
  /**
   * Use as the chart's `key`. The library measures itself once and keeps that
   * width forever, so only a remount makes it pick up a new one. This changes
   * after the box has *changed* size and settled — never on the first
   * measurement, which the chart takes correctly on its own, and never
   * mid-drag, which would replay the enter animation every frame.
   */
  sizeKey: string;
}

/**
 * A chart box that takes its size from its container instead of an aspect ratio.
 *
 * The chart library already reflows off its own ResizeObserver, so all it needs
 * is a box with a real height to fill. The observer here answers the two things
 * the library can't decide alone: how many date ticks fit the current width, and
 * whether there is room for the axis strip and legend at all.
 *
 * `onPointClick` turns the plot area into a row of invisible hit targets, one
 * per data point — the vendored chart exposes no click API and must not be
 * edited, so the drill-down lives over it rather than inside it.
 */
export function ResponsiveChart({
  children,
  pointCount,
  onPointClick,
  pointLabel,
}: {
  children: (box: IChartBox) => ReactNode;
  pointCount?: number;
  onPointClick?: (index: number) => void;
  pointLabel?: (index: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // `generation` is the remount counter, held with the size that produced it so
  // one update can advance both without a second render.
  const [settled, setSettled] = useState({ width: 0, height: 0, generation: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Coalesced to one update per frame: dragging a grid resize handle fires a
    // burst of entries, and a setState per entry is the flicker the ticket
    // describes. An identical box bails out, so a no-op resize costs no render.
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry?.contentRect;
      if (!rect) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
        setBox((prev) =>
          prev.width === next.width && prev.height === next.height ? prev : next,
        );
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // The size the chart is allowed to re-measure at. Every intermediate box a
  // drag produces is skipped — only the size it comes to rest at counts.
  useEffect(() => {
    if (!box.width || !box.height) return;
    // Already caught up: bail, or scheduling the same box again would loop.
    if (settled.width === box.width && settled.height === box.height) return;
    const id = setTimeout(
      () =>
        setSettled((prev) => ({
          width: box.width,
          height: box.height,
          // The first measurement must not remount: the chart takes its own
          // size when it mounts, and remounting there would replay the enter
          // animation a tick after it started, for nothing.
          generation: prev.width ? prev.generation + 1 : prev.generation,
        })),
      // Nothing is waiting on that first measurement, so don't make it wait.
      settled.width ? RESIZE_SETTLE_MS : 0,
    );
    return () => clearTimeout(id);
  }, [box, settled.width, settled.height]);

  const compact = box.height > 0 && box.height < COMPACT_BELOW;
  const resolved: IChartBox = {
    ...box,
    compact,
    numTicks: Math.max(2, Math.min(8, Math.floor(box.width / PX_PER_TICK))),
    sizeKey: `size-${settled.generation}`,
  };
  const margin = compact ? COMPACT_MARGIN : CHART_MARGIN;
  const plotWidth = Math.max(0, box.width - margin.left - margin.right);
  const drillable = onPointClick && pointCount && pointCount > 0 && plotWidth > 0;

  return (
    <div ref={ref} className="relative min-h-0 flex-1">
      {children(resolved)}
      {drillable ? (
        <div
          className="absolute inset-y-0 flex"
          style={{
            left: margin.left,
            width: plotWidth,
            top: margin.top,
            bottom: margin.bottom,
          }}
        >
          {Array.from({ length: pointCount }, (_, i) => (
            <button
              key={i}
              type="button"
              // Transparent by design: the chart underneath is the visual, and
              // the tooltip already answers hover. This only adds the target.
              className="h-full flex-1 cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
              aria-label={pointLabel?.(i) ?? `Open work items for point ${i + 1}`}
              onClick={() => onPointClick(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
