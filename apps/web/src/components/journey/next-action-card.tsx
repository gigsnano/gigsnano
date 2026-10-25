import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Clock01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { JOURNEY_PHASE_LABEL } from "@/lib/journey/derive";
import { EXECUTOR_META } from "@/constants/journey-meta";
import type { IJourneyStep } from "@/types";

/** The single visually-dominant next action (GIN-428: exactly one primary action). */
export function NextActionCard({
  step,
  reason,
  href,
}: {
  step: IJourneyStep;
  reason: string;
  href: string;
}) {
  const executor = step.executor ? EXECUTOR_META[step.executor] : null;
  return (
    <section
      className={cn(
        "rounded-xl border border-primary/30 bg-primary/[0.04] p-4 sm:p-5",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 motion-safe:ease-out",
      )}
    >
      <p className="text-xs font-medium text-primary">Next · {JOURNEY_PHASE_LABEL[step.phase]}</p>
      <h2 className="mt-1 text-lg font-semibold text-foreground text-balance">{step.title}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{reason}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {executor ? (
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon icon={executor.icon} className="size-3.5" />
            {executor.label}
          </span>
        ) : null}
        {step.effort ? (
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
            {step.effort}
          </span>
        ) : null}
        {step.inputs.length > 0 ? <span>Needs: {step.inputs.join(", ")}</span> : null}
      </div>

      <Link
        href={href}
        className={cn(
          "mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm",
          "transition-[transform,background-color] duration-150 ease-out hover:bg-primary/90 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        Resume step
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
      </Link>
    </section>
  );
}
