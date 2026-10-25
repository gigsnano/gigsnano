import { AiMagicIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import type { CodebaseViewId } from "@/types/code/intelligence";
import type { ICodebaseOverview } from "@/types/code/overview";

import { fmt, HEALTH_META } from "./overview-lib";
import { SectionCard } from "./section-card";

/** GIN-276 — a plain-language "codebase at a glance", synthesized ONLY from the
 * current index facts (counts, modules, health, top risk). Every clause is a real
 * indexed value linked to the evidence view — no uncited architectural claim is
 * presented as fact, which is the whole point. A full LLM-generated summary with
 * regenerate/citations slots in behind this same card when its backend ships;
 * "Ask Codebase" already hands off the repo/branch/index context for deeper Q&A. */
export function AICodebaseSummary({
  overview,
  onAsk,
  onOpenView,
  index = 0,
}: {
  overview: ICodebaseOverview;
  onAsk: () => void;
  onOpenView: (view: CodebaseViewId) => void;
  index?: number;
}) {
  const { counts, modules, health, risks } = overview;
  const topModules = modules.items.slice(0, 3).map((m) => m.name);
  const topRisk = risks.items[0];
  const healthMeta = health.score == null ? null : HEALTH_META[
    health.score >= 80 ? "healthy" : health.score >= 50 ? "warning" : "critical"
  ];

  const evidence: { label: string; view: CodebaseViewId }[] = [
    { label: `${fmt(counts.symbols)} symbols`, view: "dependencies" },
    { label: `${fmt(modules.items.length)} modules`, view: "modules" },
    ...(health.score != null ? [{ label: `Health ${health.score}`, view: "metrics" as const }] : []),
    ...(topRisk ? [{ label: `${risks.items.length} findings`, view: "issues" as const }] : []),
  ];

  return (
    <SectionCard
      title="Codebase summary"
      icon={AiMagicIcon}
      provenance={{ ...counts, source: "Synthesized from the current index" }}
      index={index}
      action={
        <button
          type="button"
          onClick={onAsk}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
        >
          <HugeiconsIcon icon={AiMagicIcon} className="size-3.5" />
          Ask Codebase
        </button>
      }
    >
      {counts.symbols === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Once indexed, a grounded summary of the stack, boundaries, and risks appears here.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-foreground/90">
            {fmt(counts.files)} files and {fmt(counts.symbols)} symbols across{" "}
            {fmt(modules.items.length)} modules
            {topModules.length ? `, led by ${topModules.join(", ")}` : ""}.
            {healthMeta ? (
              <>
                {" "}Overall health is{" "}
                <span className={cn("font-medium", healthMeta.text)}>{healthMeta.label.toLowerCase()}</span>
                {" "}({health.score}/100).
              </>
            ) : null}
            {topRisk ? ` Most pressing: ${topRisk.title}.` : ""}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {evidence.map((e) => (
              <button
                key={e.label}
                type="button"
                onClick={() => onOpenView(e.view)}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {e.label}
              </button>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}
