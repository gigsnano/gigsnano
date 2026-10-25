"use client";

import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EImportStrategy } from "@/types";

interface IStrategyCard {
  id: EImportStrategy;
  title: string;
  summary: string;
  /** What actually changes — the thing a comparison card usually leaves out. */
  creates: string;
  keeps: string;
  bestFor: string;
}

const STRATEGIES: IStrategyCard[] = [
  {
    id: EImportStrategy.Preserve,
    title: "Preserve the supplied plan",
    summary: "Mirror what the documents already describe. Nothing is restructured or invented.",
    creates: "A cycle per phase, a story per task",
    keeps: "The external team's structure exactly as written",
    bestFor: "A plan you have already agreed and want to execute as-is",
  },
  {
    id: EImportStrategy.Convert,
    title: "Convert to GigsNano structure",
    summary: "Reshape the package into the canonical hierarchy this app plans with.",
    creates: "Modules, milestones, cycles, epics and stories",
    keeps: "Every item's link back to the document section it came from",
    bestFor: "A package you will keep evolving inside GigsNano",
  },
  {
    id: EImportStrategy.Hybrid,
    title: "Hybrid",
    summary: "Convert, but flag anything the documents did not settle for review first.",
    creates: "The same as Convert, with low-confidence items marked Needs review",
    keeps: "A deliberate pause on everything the documents were vague about",
    bestFor: "A package with a mix of decided and half-formed sections",
  },
];

export function StrategyStep({
  selected,
  isBuilding,
  error,
  onChoose,
}: {
  selected: EImportStrategy | null;
  isBuilding: boolean;
  error: string | null;
  onChoose: (strategy: EImportStrategy) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-base font-medium text-foreground">Choose how to structure it</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This proposes a plan — it still creates nothing. Changing your mind later rebuilds the
          proposal without losing the analysis or any decision you made on a finding.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {STRATEGIES.map((strategy) => {
          const isSelected = selected === strategy.id;
          return (
            <button
              key={strategy.id}
              type="button"
              aria-pressed={isSelected}
              disabled={isBuilding}
              onClick={() => onChoose(strategy.id)}
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-4 text-left",
                "transition-[border-color,background-color,box-shadow] duration-150 ease-out",
                "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60",
                isSelected ? "border-primary bg-accent/50 shadow-sm" : "border-border",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{strategy.title}</span>
                {isSelected ? (
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    className="size-4 shrink-0 text-primary"
                  />
                ) : null}
              </span>
              <span className="text-sm text-muted-foreground">{strategy.summary}</span>
              <dl className="flex flex-col gap-1.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">Creates</dt>
                  <dd className="text-foreground">{strategy.creates}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Keeps</dt>
                  <dd className="text-foreground">{strategy.keeps}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Best for</dt>
                  <dd className="text-foreground">{strategy.bestFor}</dd>
                </div>
              </dl>
            </button>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isBuilding ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Proposing the structure…
        </p>
      ) : null}

      {selected && !isBuilding ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => onChoose(selected)} variant="outline">
            Re-propose with this strategy
          </Button>
        </div>
      ) : null}
    </div>
  );
}
