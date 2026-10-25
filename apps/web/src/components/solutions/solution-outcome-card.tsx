"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { isSolutionSelectable, recommendedStartingPoint } from "@/lib/solutions/registry";
import { solutionPresentation } from "@/constants/solutions";
import type { ISolutionDefinition } from "@/types";

/**
 * One outcome card in the global solution chooser (GIN-446). The headline is the
 * measurable outcome, not a category — "Detect and recover missing invoice
 * revenue", never "Business".
 *
 * A gated solution renders as a non-interactive element rather than a disabled
 * button, so it is unreachable by keyboard and by click while still explaining
 * itself. Selectability is re-checked server-side on draft creation.
 */
export function SolutionOutcomeCard({
  solution,
  onSelect,
}: {
  solution: ISolutionDefinition;
  onSelect: (solution: ISolutionDefinition) => void;
}) {
  const { icon, tile } = solutionPresentation(solution.key);
  const selectable = isSolutionSelectable(solution);
  const recommended = recommendedStartingPoint(solution);

  const body = (
    <>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", tile)}>
        <HugeiconsIcon icon={selectable ? icon : SquareLock02Icon} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium">{solution.name}</span>
          {!selectable ? (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              Not enabled
            </span>
          ) : null}
        </span>
        <span className="text-sm text-foreground/80">{solution.outcome}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">
          {solution.description}
        </span>
        <span className="mt-0.5 text-xs text-muted-foreground">
          {selectable ? (
            <>
              Creates {article(solution.container_noun)} {solution.container_noun}
              {recommended ? <> · Recommended: {recommended.label.toLowerCase()}</> : null}
            </>
          ) : (
            solution.availability_reason
          )}
        </span>
      </span>
    </>
  );

  if (!selectable) {
    return (
      <li className="t-stagger-line flex gap-3 rounded-lg border border-dashed bg-muted/20 p-4 text-left opacity-70">
        {body}
      </li>
    );
  }

  return (
    <li className="t-stagger-line">
      <button
        type="button"
        onClick={() => onSelect(solution)}
        className="group flex w-full gap-3 rounded-lg border p-4 text-left transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/40 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98] motion-reduce:active:scale-100"
      >
        {body}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className="mt-1 size-4 shrink-0 self-start text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        />
      </button>
    </li>
  );
}

/** "a project" / "an assurance workspace" — the noun comes from the backend. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}
