import { HugeiconsIcon } from "@hugeicons/react";
import { CircleLock01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { STEP_STATE_META } from "@/constants/journey-meta";
import type { IJourneyStep } from "@/types";

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

/** Region 1 — journey context: purpose, evidence, completion contract, deps, status. */
export function ContextPanel({
  step,
  prereqTitles,
  lockReason,
}: {
  step: IJourneyStep;
  prereqTitles: string[];
  lockReason: string | null;
}) {
  const meta = STEP_STATE_META[step.state];
  return (
    <div className="space-y-3.5 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Step context</h2>

      <Block label="Purpose">{step.purpose}</Block>

      <Block label="Completion contract">
        {step.output
          ? `${step.output.label} — approved & verified (v${step.output.version})`
          : "Produce and verify this step's output before the next step unlocks."}
      </Block>

      {step.inputs.length > 0 ? (
        <Block label="Evidence used">
          <ul className="flex flex-wrap gap-1.5">
            {step.inputs.map((i) => (
              <li key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {i}
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {prereqTitles.length > 0 ? (
        <Block label="Depends on">{prereqTitles.join(", ")}</Block>
      ) : null}

      <Block label="Status">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", meta.chip)}>
          <HugeiconsIcon icon={meta.icon} className="size-3.5" />
          {meta.label}
        </span>
      </Block>

      {lockReason ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <HugeiconsIcon icon={CircleLock01Icon} className="mt-0.5 size-3.5 shrink-0" />
          <span>{lockReason}. Resolve it to work this step.</span>
        </div>
      ) : null}
    </div>
  );
}
