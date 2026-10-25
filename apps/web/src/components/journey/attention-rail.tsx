import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, CircleLock01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { STEP_STATE_META } from "@/constants/journey-meta";
import type { IJourneyStep, IJourneyStepOutput } from "@/types";

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-3">
      <h3 className="mb-2 text-xs font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function AttentionRail({
  attention,
  blockers,
  recentOutputs,
  onSelect,
}: {
  attention: IJourneyStep[];
  blockers: { step: IJourneyStep; reason: string }[];
  recentOutputs: IJourneyStepOutput[];
  onSelect: (step: IJourneyStep) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <RailSection title="Needs your attention">
        {attention.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing needs you right now.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {attention.map((step) => {
              const meta = STEP_STATE_META[step.state];
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(step)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted/60 active:bg-muted focus-visible:bg-muted/60 focus-visible:outline-none"
                  >
                    <HugeiconsIcon icon={meta.icon} className={cn("size-4 shrink-0", meta.color)} />
                    <span className="min-w-0 flex-1 truncate text-foreground">{step.title}</span>
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium", meta.chip)}>
                      {meta.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </RailSection>

      {blockers.length > 0 ? (
        <RailSection title="Blocked">
          <ul className="flex flex-col gap-1.5">
            {blockers.map(({ step, reason }) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <HugeiconsIcon icon={CircleLock01Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{step.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{reason}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </RailSection>
      ) : null}

      {recentOutputs.length > 0 ? (
        <RailSection title="Recent outputs">
          <ul className="flex flex-col gap-1.5">
            {recentOutputs.slice(0, 5).map((o) => (
              <li key={`${o.type}-${o.version}`} className="flex items-center gap-2 px-1.5 text-sm">
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  className={cn("size-3.5 shrink-0", o.verified ? "text-emerald-500" : "text-muted-foreground/40")}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{o.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">v{o.version}</span>
              </li>
            ))}
          </ul>
        </RailSection>
      ) : null}
    </div>
  );
}
