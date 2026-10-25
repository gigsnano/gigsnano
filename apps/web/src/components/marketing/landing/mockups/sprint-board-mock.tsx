import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  SquareLock01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

type CardState = "done" | "active" | "locked";

const STEPS: { agent: string; initials: string; artifact: string; state: CardState }[] = [
  { agent: "Analyst", initials: "AN", artifact: "Project Brief", state: "done" },
  { agent: "Product Manager", initials: "PM", artifact: "PRD", state: "active" },
  { agent: "Architect", initials: "AR", artifact: "Architecture", state: "locked" },
  { agent: "Scrum Master", initials: "SM", artifact: "Epics & Stories", state: "locked" },
];

const STATE_META: Record<
  CardState,
  { label: string; icon: typeof CheckmarkCircle02Icon; className: string }
> = {
  done: { label: "Done", icon: CheckmarkCircle02Icon, className: "text-primary" },
  active: { label: "In progress", icon: Loading03Icon, className: "text-amber-500" },
  locked: { label: "Locked", icon: SquareLock01Icon, className: "text-muted-foreground/60" },
};

/**
 * Hero mockup: the Sprint-0 board (an agent + artifact per card, with real
 * unlock states) beside a live agent chat pane — the product's core loop,
 * rendered in DOM so it themes with the page.
 */
export function SprintBoardMock() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-raised-200">
      {/* window bar */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="size-2.5 rounded-full bg-muted-foreground/25" />
        <span className="ml-2 text-xs font-medium text-muted-foreground">
          acme · Sprint-0 board
        </span>
      </div>

      <div className="flex flex-col gap-px bg-border sm:flex-row">
        {/* board */}
        <div className="flex-1 bg-card p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sprint 0 · Planning
          </p>
          <ul className="space-y-2">
            {STEPS.map((step) => {
              const meta = STATE_META[step.state];
              return (
                <li
                  key={step.agent}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5",
                    step.state === "active" && "border-primary/40 ring-1 ring-primary/20",
                    step.state === "locked" && "opacity-60",
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                    {step.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {step.artifact}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {step.agent}
                    </span>
                  </span>
                  <HugeiconsIcon
                    icon={meta.icon}
                    className={cn("size-4 shrink-0", meta.className)}
                    aria-hidden
                  />
                </li>
              );
            })}
          </ul>
        </div>

        {/* chat pane */}
        <div className="flex w-full flex-col bg-card p-4 sm:w-[46%]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
              PM
            </span>
            <span className="text-xs font-medium text-foreground">Product Manager</span>
          </div>
          <div className="space-y-2.5 text-[11px] leading-relaxed">
            <p className="rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-muted-foreground">
              We've got the brief. Let's turn it into a PRD — who's the primary user, and what's
              the one job they hire this for?
            </p>
            <p className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3 py-2 text-primary-foreground">
              Solo founders shipping an MVP. The job is planning without a PM.
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <span className="flex-1 truncate text-[11px] text-muted-foreground">
              Ask the PM agent…
            </span>
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" aria-hidden />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
