import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { CircleLock01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { JOURNEY_PHASE_LABEL } from "@/lib/journey/derive";
import { STEP_STATE_META, EXECUTOR_META } from "@/constants/journey-meta";
import type { IJourneyStep } from "@/types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Read-only Active Step panel (GIN-428). Shows the step's contract — purpose,
 * inputs, decisions, output, approver, downstream impact. No chat / execution
 * in this shell slice.
 */
export function ActiveStepPanel({
  step,
  lockReason,
  workspaceHref,
  onClose,
}: {
  step: IJourneyStep | null;
  lockReason?: string | null;
  workspaceHref?: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={Boolean(step)} onOpenChange={(open) => (open ? null : onClose())}>
      {step ? (
        <SheetContent className="max-w-md">
          <div className="border-b px-5 pb-4 pt-5">
            <p className="text-xs font-medium text-primary">{JOURNEY_PHASE_LABEL[step.phase]}</p>
            <SheetTitle className="mt-1 text-base">{step.title}</SheetTitle>
            <SheetDescription className="mt-1">{step.purpose}</SheetDescription>
            <span
              className={cn(
                "mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                STEP_STATE_META[step.state].chip,
              )}
            >
              <HugeiconsIcon icon={STEP_STATE_META[step.state].icon} className="size-3.5" />
              {STEP_STATE_META[step.state].label}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3">
            {lockReason ? (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <HugeiconsIcon icon={CircleLock01Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">{lockReason}. Complete it to unlock this step.</p>
              </div>
            ) : null}

            <dl className="divide-y">
              {step.executor ? (
                <Field label="Executor">
                  <span className="inline-flex items-center gap-1.5">
                    <HugeiconsIcon icon={EXECUTOR_META[step.executor].icon} className="size-3.5" />
                    {EXECUTOR_META[step.executor].label}
                  </span>
                </Field>
              ) : null}
              {step.effort ? <Field label="Est. effort">{step.effort}</Field> : null}
              {step.inputs.length > 0 ? (
                <Field label="Required inputs">{step.inputs.join(", ")}</Field>
              ) : null}
              {step.decisions.length > 0 ? (
                <Field label="Decisions">
                  <ul className="flex flex-col gap-0.5">
                    {step.decisions.map((d) => (
                      <li key={d.label}>
                        {d.label}
                        {d.value ? <span className="text-muted-foreground">: {d.value}</span> : (
                          <span className="text-muted-foreground"> — pending</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Field>
              ) : null}
              {step.output ? (
                <Field label="Output">
                  {step.output.label} · v{step.output.version}{" "}
                  <span className={step.output.verified ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                    ({step.output.verified ? "verified" : "not verified"})
                  </span>
                </Field>
              ) : null}
              {step.approver ? <Field label="Approver">{step.approver}</Field> : null}
              {step.downstream_impact && step.downstream_impact.length > 0 ? (
                <Field label="Impacts">{step.downstream_impact.join(", ")}</Field>
              ) : null}
            </dl>

          </div>

          {workspaceHref ? (
            <div className="border-t p-4">
              <Link
                href={workspaceHref}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-[transform,background-color] duration-150 ease-out hover:bg-primary/90 active:scale-[0.98]"
              >
                Open agent workspace
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </Link>
            </div>
          ) : null}
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
