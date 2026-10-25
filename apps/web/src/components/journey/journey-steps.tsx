import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, CircleLock01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { JOURNEY_PHASE_ORDER, JOURNEY_PHASE_LABEL } from "@/lib/journey/derive";
import { STEP_STATE_META, EXECUTOR_META } from "@/constants/journey-meta";
import type { ID, IJourneyStep, EJourneyPhase } from "@/types";

function StepRow({
  step,
  lock,
  active,
  onSelect,
  index,
}: {
  step: IJourneyStep;
  lock: string | null;
  active: boolean;
  onSelect: (step: IJourneyStep) => void;
  index: number;
}) {
  const meta = STEP_STATE_META[step.state];
  const locked = Boolean(lock);
  const executor = step.executor ? EXECUTOR_META[step.executor] : null;

  return (
    <li
      className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-300 motion-safe:ease-out"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      <button
        type="button"
        onClick={() => onSelect(step)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "group flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
          "hover:bg-muted/60 active:bg-muted focus-visible:bg-muted/60 focus-visible:outline-none",
          active && "bg-muted",
        )}
      >
        <HugeiconsIcon
          icon={locked ? CircleLock01Icon : meta.icon}
          className={cn("mt-0.5 size-4 shrink-0", locked ? "text-muted-foreground" : meta.color)}
          aria-label={locked ? "Blocked" : meta.label}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-sm font-medium",
                locked ? "text-muted-foreground" : "text-foreground group-hover:text-primary",
              )}
            >
              {step.title}
            </span>
            {step.output ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                {step.output.verified ? (
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3 text-emerald-500" />
                ) : null}
                v{step.output.version}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {locked ? lock : executor ? `${meta.label} · ${executor.label}` : meta.label}
          </span>
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </button>
    </li>
  );
}

/** Journey step list, grouped by phase, with lock explanations. */
export function JourneySteps({
  steps,
  locks,
  activeStepId,
  onSelect,
}: {
  steps: IJourneyStep[];
  locks: Record<ID, string | null>;
  activeStepId?: ID;
  onSelect: (step: IJourneyStep) => void;
}) {
  // Single pass over phases: build the non-empty groups AND the continuous
  // stagger index (precomputed, not a render-time counter, so React Compiler
  // can memoize and we avoid a map().filter() double-iteration).
  const groups: { phase: EJourneyPhase; phaseSteps: IJourneyStep[] }[] = [];
  const indexById = new Map<ID, number>();
  let order = 0;
  for (const phase of JOURNEY_PHASE_ORDER) {
    const phaseSteps = steps.filter((s) => s.applicable && s.phase === phase);
    if (phaseSteps.length === 0) continue;
    for (const s of phaseSteps) indexById.set(s.id, order++);
    groups.push({ phase, phaseSteps });
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ phase, phaseSteps }) => (
        <section key={phase}>
          <h3 className="px-2.5 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {JOURNEY_PHASE_LABEL[phase]}
          </h3>
          <ul className="flex flex-col">
            {phaseSteps.map((step) => (
              <StepRow
                key={step.id}
                step={step}
                lock={locks[step.id] ?? null}
                active={step.id === activeStepId}
                onSelect={onSelect}
                index={indexById.get(step.id) ?? 0}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
