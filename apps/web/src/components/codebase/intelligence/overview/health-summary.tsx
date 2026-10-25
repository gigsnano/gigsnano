import { PulseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CodebaseViewId } from "@/types/code/intelligence";
import type { IHealthSection } from "@/types/code/overview";

import { HEALTH_META, toViewId } from "./overview-lib";
import { SectionCard } from "./section-card";

/** GIN-274 — overall codebase health + four dimensions (Architecture,
 * Maintainability, Test coverage, Security). Every label comes from the backend's
 * documented scoring service; "not measured" is shown as its own state, never as a
 * pass. The score carries a tooltip explaining how it's derived and how fresh. */
export function CodebaseHealthSummary({
  health,
  onOpenView,
  index = 0,
}: {
  health: IHealthSection;
  onOpenView: (view: CodebaseViewId) => void;
  index?: number;
}) {
  const scoreBand =
    health.score == null
      ? "unavailable"
      : health.score >= 80
        ? "healthy"
        : health.score >= 50
          ? "warning"
          : "critical";
  const bandMeta = HEALTH_META[scoreBand];

  return (
    <SectionCard title="Codebase health" icon={PulseIcon} provenance={health} index={index}>
      <div className="flex items-start gap-4 pb-1">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 flex-col items-center rounded-lg px-2 py-1 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Overall health score ${health.score ?? "not measured"} of 100, ${bandMeta.label}`}
              >
                <span className={cn("text-3xl font-semibold tabular-nums leading-none", bandMeta.text)}>
                  {health.score ?? "—"}
                </span>
                <span className="mt-1 text-[11px] font-medium text-muted-foreground">
                  {health.score == null ? "Not scored" : bandMeta.label}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-xs leading-relaxed">
              Mean of the measured dimensions ({health.measured_dimensions} of 4). A dimension whose
              analyzer didn&apos;t run is excluded, not counted as passing — so the score never masks a
              gap.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {health.dimensions.map((d) => {
            const m = HEALTH_META[d.status];
            const view = toViewId(d.drilldown);
            return (
              <li key={d.key} className="flex items-center gap-2.5">
                <span className={cn("size-2 shrink-0 rounded-full", m.dot)} aria-hidden />
                <span className="w-28 shrink-0 truncate text-xs font-medium">{d.label}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={d.evidence}>
                  {d.evidence}
                </span>
                <span className={cn("shrink-0 text-[11px] font-medium", m.text)}>{m.label}</span>
                {view ? (
                  <button
                    type="button"
                    onClick={() => onOpenView(view)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open ${d.label} report`}
                  >
                    View
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}
