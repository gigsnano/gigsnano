import { Alert01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import type { CodebaseViewId } from "@/types/code/intelligence";
import type { IRisksSection } from "@/types/code/overview";

import { SEVERITY_META } from "./overview-lib";
import { SectionCard } from "./section-card";

/** GIN-277 — the prioritized "what needs attention" list: security findings and
 * complexity/churn hotspots ranked by severity. Each item carries evidence, the
 * affected location, the analyzer that found it, and drills into the right view.
 * Zero findings on a scan that ran (`available`) reads as clean; an unavailable
 * scan reads as unknown — never conflated. */
export function AttentionNeeded({
  risks,
  onOpenView,
  index = 0,
}: {
  risks: IRisksSection;
  onOpenView: (view: CodebaseViewId) => void;
  index?: number;
}) {
  const top = risks.items.slice(0, 3);
  const clean = risks.state === "available" && risks.items.length === 0;

  return (
    <SectionCard
      title="Attention needed"
      icon={Alert01Icon}
      provenance={risks}
      index={index}
      action={
        risks.items.length > 3 ? (
          <button
            type="button"
            onClick={() => onOpenView("issues")}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          >
            View all {risks.items.length}
          </button>
        ) : undefined
      }
    >
      {clean ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-emerald-500" />
          No blocking findings from the analyzers that ran.
        </div>
      ) : top.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {risks.detail ?? "No findings available — the analyzers haven't run for this index."}
        </p>
      ) : (
        <ul className="space-y-1">
          {top.map((r) => {
            const sev = SEVERITY_META[r.severity];
            const view: CodebaseViewId = r.category === "security" ? "issues" : "metrics";
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpenView(view)}
                  className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn("mt-1 size-2 shrink-0 rounded-full", sev.dot)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs font-medium">{r.title}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize",
                          sev.badge,
                        )}
                      >
                        {r.severity}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground" title={r.evidence}>
                      {r.evidence}
                    </span>
                    {r.location ? (
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground/80">
                        {r.location} · {r.analyzer}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
