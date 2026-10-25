"use client";

import { cn } from "@/lib/utils";
import { communityColor } from "@/lib/code/community-color";
import { riskToneClass } from "@/lib/code/node-type";
import type { IModuleSummary } from "@/types/code/intelligence";

/**
 * Module legend strip under the graph: not colour-dots-alone — each module shows
 * node count, coverage, and risk, and clicking it inspects that module. Sits at
 * the foot of the graph canvas on graph-layout views.
 */
export function GraphLegend({
  modules,
  onFocus,
}: {
  modules: IModuleSummary[];
  onFocus: (key: string) => void;
}) {
  if (modules.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t bg-card/85 px-2 py-1.5 backdrop-blur">
      <span className="shrink-0 pl-1 pr-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Modules
      </span>
      {modules.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onFocus(m.key)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent active:scale-[0.98]"
          style={{ transitionTimingFunction: "var(--ease-out)" }}
        >
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: communityColor(m.key) }}
          />
          <span className="font-medium text-foreground">{m.name}</span>
          <span className="tabular-nums text-muted-foreground">{m.nodeCount}</span>
          {typeof m.coverage === "number" ? (
            <span className="tabular-nums text-muted-foreground">· {m.coverage}%</span>
          ) : null}
          {m.risk ? (
            <span className={cn("text-[10px] font-medium uppercase", riskToneClass(m.risk))}>
              {m.risk}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
