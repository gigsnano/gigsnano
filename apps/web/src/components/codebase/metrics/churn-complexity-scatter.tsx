"use client";

import { scaleLinear } from "@visx/scale";
import { Circle } from "@visx/shape";
import { ParentSize } from "@visx/responsive";

import type { IHotspot } from "@/types";
import { churnComplexityPoints, type TScatterQuadrant } from "@/lib/code/metrics-shape";

// Quadrant is a state encoding (risk level), so it draws from the reserved
// status palette rather than the categorical `--chart-*` series ramp.
const QUADRANT_COLOR: Record<TScatterQuadrant, string> = {
  "act-now": "var(--destructive)",
  complex: "var(--chart-4)",
  churn: "var(--chart-2)",
  stable: "var(--muted-foreground)",
};

const QUADRANT_LABEL: Record<TScatterQuadrant, string> = {
  "act-now": "Act now (high churn + complex)",
  complex: "Complex, stable",
  churn: "Churning, simple",
  stable: "Low risk",
};

const MARGIN = { top: 12, right: 16, bottom: 28, left: 32 };

/** X = churn, Y = complexity, bubble = hotspot score — the "act now" quadrant
 * (top-right) is where high churn meets high complexity. */
export function ChurnComplexityScatter({ hotspots }: { hotspots: IHotspot[] }) {
  const points = churnComplexityPoints(hotspots);
  const maxChurn = Math.max(...points.map((p) => p.churn), 1);
  const maxComplexity = Math.max(...points.map((p) => p.complexity), 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="h-56 w-full">
        <ParentSize debounceTime={10}>
          {({ width, height }) => {
            const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
            const innerHeight = Math.max(height - MARGIN.top - MARGIN.bottom, 0);
            const xScale = scaleLinear({ domain: [0, maxChurn * 1.05], range: [0, innerWidth] });
            const yScale = scaleLinear({ domain: [0, maxComplexity * 1.05], range: [innerHeight, 0] });

            return (
              <svg width={width} height={height} role="img" aria-label="Churn vs complexity scatter">
                <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
                  <line
                    x1={0}
                    x2={innerWidth}
                    y1={innerHeight}
                    y2={innerHeight}
                    stroke="var(--chart-grid)"
                  />
                  <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="var(--chart-grid, var(--border))" />
                  <text
                    x={innerWidth / 2}
                    y={innerHeight + 22}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px]"
                  >
                    Churn (commits touching the file)
                  </text>
                  <text
                    x={-innerHeight / 2}
                    y={-22}
                    textAnchor="middle"
                    transform="rotate(-90)"
                    className="fill-muted-foreground text-[10px]"
                  >
                    Complexity
                  </text>
                  {points.map((p) => (
                    <Circle
                      key={p.file}
                      cx={xScale(p.churn)}
                      cy={yScale(p.complexity)}
                      r={p.radius}
                      fill={QUADRANT_COLOR[p.quadrant]}
                      fillOpacity={0.75}
                      stroke={QUADRANT_COLOR[p.quadrant]}
                    >
                      <title>
                        {p.file} — churn {p.churn}, complexity {p.complexity} ({QUADRANT_LABEL[p.quadrant]})
                      </title>
                    </Circle>
                  ))}
                </g>
              </svg>
            );
          }}
        </ParentSize>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(QUADRANT_LABEL) as TScatterQuadrant[]).map((q) => (
          <span key={q} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: QUADRANT_COLOR[q] }}
              aria-hidden
            />
            {QUADRANT_LABEL[q]}
          </span>
        ))}
      </div>
    </div>
  );
}
