"use client";

import { ParentSize } from "@visx/responsive";

import type { IHotspot } from "@/types";
import { computeTreemapLayout, hotspotHeatColor } from "@/lib/code/metrics-shape";

/**
 * Files sized by churn (LOC isn't in the backend's hotspot join, so churn is
 * the next-best size signal — falls back to complexity when a file has no
 * churn yet) and colored by hotspot score (sequential heat: cool → destructive).
 */
export function HotspotTreemap({ hotspots }: { hotspots: IHotspot[] }) {
  const items = hotspots.map((h) => ({ id: h.file, value: h.churn || h.complexity || 1 }));
  const byId = new Map(hotspots.map((h) => [h.file, h]));

  return (
    <div className="flex flex-col gap-2">
      <div className="h-56 w-full">
        <ParentSize debounceTime={10}>
          {({ width, height }) => {
            const rects = computeTreemapLayout(items, width, height);
            return (
              <svg width={width} height={height} role="img" aria-label="Hotspot treemap">
                {rects.map((r) => {
                  const h = byId.get(r.id);
                  return (
                    <g key={r.id} transform={`translate(${r.x}, ${r.y})`}>
                      <title>
                        {r.id} — complexity {h?.complexity ?? 0}, churn {h?.churn ?? 0}, hotspot{" "}
                        {h ? h.hotspot.toFixed(2) : "0.00"}
                      </title>
                      <rect
                        width={Math.max(r.w - 2, 0)}
                        height={Math.max(r.h - 2, 0)}
                        rx={4}
                        fill={hotspotHeatColor(h?.hotspot ?? 0)}
                      />
                    </g>
                  );
                })}
              </svg>
            );
          }}
        </ParentSize>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Cooler</span>
        <span
          className="h-2 w-24 rounded-full"
          style={{
            background:
              "linear-gradient(to right, var(--chart-1), var(--chart-2), var(--chart-3), var(--chart-4), var(--chart-5))",
          }}
          aria-hidden
        />
        <span>Hotter</span>
        <span className="ml-auto">Sized by churn · hover a tile for detail</span>
      </div>
    </div>
  );
}
