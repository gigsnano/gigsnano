"use client";

import { CheckmarkCircle02Icon, Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

export type IntakeStepId =
  | "upload"
  | "analyse"
  | "review"
  | "strategy"
  | "repository"
  | "changes"
  | "create";

export interface IIntakeStep {
  id: IntakeStepId;
  label: string;
  hint: string;
  state: "todo" | "active" | "complete" | "warning";
}

/** The persistent step rail. Visible throughout so the user always knows how far
 *  in they are and what is left — a wizard that hides its own shape feels longer
 *  than it is. */
export function IntakeStepper({
  steps,
  onSelect,
}: {
  steps: IIntakeStep[];
  onSelect: (id: IntakeStepId) => void;
}) {
  return (
    <nav aria-label="Project intake steps" className="w-full lg:w-56 lg:shrink-0">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
        {steps.map((step, index) => {
          const reachable = step.state !== "todo" || steps[index - 1]?.state === "complete";
          return (
            <li key={step.id} className="min-w-0 flex-1 lg:flex-none">
              <button
                type="button"
                aria-current={step.state === "active" ? "step" : undefined}
                disabled={!reachable}
                onClick={() => onSelect(step.id)}
                className={cn(
                  "group flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left",
                  "transition-[background-color,color] duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45",
                  step.state === "active" ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-medium",
                    "transition-colors duration-150 ease-out",
                    step.state === "complete" && "border-transparent bg-primary text-primary-foreground",
                    step.state === "warning" && "border-transparent bg-amber-500 text-white",
                    step.state === "active" && "border-primary text-primary",
                    step.state === "todo" && "border-border text-muted-foreground",
                  )}
                >
                  {step.state === "complete" ? (
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" />
                  ) : step.state === "warning" ? (
                    <HugeiconsIcon icon={Alert02Icon} className="size-3" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-sm",
                      step.state === "active" ? "font-medium text-foreground" : "text-foreground/90",
                    )}
                  >
                    {step.label}
                  </span>
                  {/* The hint is the step's current state, not a static description —
                      "3 documents ready" tells you more than "Upload files". */}
                  <span className="hidden truncate text-xs text-muted-foreground lg:block">
                    {step.hint}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
