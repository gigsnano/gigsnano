"use client";

import { Pie } from "@visx/shape";
import { ParentSize } from "@visx/responsive";

import type { ILanguageLoc } from "@/types";
import { languageDonutSlices } from "@/lib/code/metrics-shape";

// Fixed categorical order (dataviz: assign hues in fixed order, never
// cycled) — the 6th+ language already folds into "Other" in the pure lib,
// so this ramp never runs out.
const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)", // reserved for "Other"
];

/** LOC by language, donut with a direct-labeled legend (no color-only identity). */
export function LanguageDonut({ languages }: { languages: ILanguageLoc[] }) {
  const slices = languageDonutSlices(languages);

  return (
    <div className="flex items-center gap-4">
      <div className="size-40 shrink-0">
        <ParentSize debounceTime={10}>
          {({ width, height }) => {
            const size = Math.min(width, height);
            const radius = size / 2;
            return (
              <svg width={size} height={size} role="img" aria-label="Lines of code by language">
                <g transform={`translate(${radius}, ${radius})`}>
                  <Pie
                    data={slices}
                    pieValue={(d) => d.loc}
                    outerRadius={radius}
                    innerRadius={radius * 0.6}
                    padAngle={0.01}
                  >
                    {(pie) =>
                      pie.arcs.map((arc, i) => (
                        <path key={slices[i].name} d={pie.path(arc) ?? undefined} fill={SLICE_COLORS[i]}>
                          <title>
                            {slices[i].name}: {slices[i].loc.toLocaleString()} LOC (
                            {slices[i].percent.toFixed(1)}%)
                          </title>
                        </path>
                      ))
                    }
                  </Pie>
                </g>
              </svg>
            );
          }}
        </ParentSize>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: SLICE_COLORS[i] }}
              aria-hidden
            />
            <span className="text-foreground">{s.name}</span>
            <span>{s.percent.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
