"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, ArrowRight01Icon, FolderAddIcon } from "@hugeicons/core-free-icons";

import { SOLUTION_CHOOSER_COPY } from "@/constants/solutions";
import { isSolutionSelectable } from "@/lib/solutions/registry";
import type { ISetupDraft, ISolutionDefinition, ISolutionRegistry } from "@/types";

import { SetupDraftList } from "./setup-draft-list";
import { SolutionOutcomeCard } from "./solution-outcome-card";

/**
 * Step 1 of the create flow (GIN-446): choose an outcome, or resume a draft.
 *
 * Nothing here creates anything. The draft is only created once a solution is
 * selected, which is what lets a user open and abandon this without leaving an
 * empty project behind.
 */
export function SolutionChooser({
  registry,
  drafts,
  isLoading,
  error,
  onSelect,
  onSelectBlank,
  onResumeDraft,
  onDiscardDraft,
  discardingDraftId,
  selectError,
}: {
  registry: ISolutionRegistry | undefined;
  drafts: ISetupDraft[];
  isLoading: boolean;
  error: unknown;
  onSelect: (solution: ISolutionDefinition) => void;
  /** Skip the outcome setup: create an empty project with no work items. */
  onSelectBlank: () => void;
  onResumeDraft: (draft: ISetupDraft) => void;
  onDiscardDraft: (draft: ISetupDraft) => void;
  discardingDraftId: string | null;
  /** A rejected selection (e.g. the solution was switched off server-side). */
  selectError: string | null;
}) {
  if (isLoading) return <ChooserSkeleton />;

  if (error || !registry) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        We couldn&apos;t load the available solutions. Close this and try again.
      </p>
    );
  }

  const gated = registry.solutions.filter((s) => !isSolutionSelectable(s));

  return (
    <div className="flex flex-col gap-5">
      {selectError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <HugeiconsIcon icon={AlertCircleIcon} className="mt-0.5 size-4 shrink-0" />
          {selectError}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {registry.solutions.map((solution) => (
          <SolutionOutcomeCard key={solution.key} solution={solution} onSelect={onSelect} />
        ))}
        {/* Not an outcome — the escape hatch, so it sits last and reads quieter. */}
        <li className="t-stagger-line">
          <button
            type="button"
            onClick={onSelectBlank}
            className="group flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/40 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <HugeiconsIcon icon={FolderAddIcon} className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">Blank project</span>
              <span className="text-xs text-muted-foreground">
                Just the project — no planning sprint or work items. Add them yourself.
              </span>
            </span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            />
          </button>
        </li>
      </ul>

      <SetupDraftList
        drafts={drafts}
        registry={registry}
        onResume={onResumeDraft}
        onDiscard={onDiscardDraft}
        discardingId={discardingDraftId}
      />

      <details className="group rounded-md border bg-card/40 px-3 py-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground">
          {SOLUTION_CHOOSER_COPY.compareSummary}
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            Every solution shares the same GigsNano core — people and permissions, the work graph,
            approvals, agents, audit and search. What changes is the navigation you get, the objects
            you work on, and which integrations are required.
          </p>
          <ul className="flex flex-col gap-1">
            {registry.solutions.map((solution) => (
              <li key={solution.key}>
                <span className="font-medium text-foreground">{solution.name}</span> — works in{" "}
                {solution.container_noun}s, with{" "}
                {solution.navigation
                  .slice(0, 3)
                  .map((entry) => entry.label)
                  .join(", ")}{" "}
                and more.
              </li>
            ))}
          </ul>
          {gated.length > 0 ? (
            <p>
              {gated.map((s) => s.name).join(" and ")}{" "}
              {gated.length === 1 ? "is" : "are"} controlled by a workspace admin, so the option
              stays visible but can&apos;t be started here.
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

/**
 * Matches the real layout — two card rows and the comparison strip — so opening
 * the chooser doesn't shift as the registry arrives.
 */
function ChooserSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2">
        {[0, 1].map((row) => (
          <div key={row} className="flex gap-3 rounded-lg border p-4">
            <div className="size-9 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3.5 w-56 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-8 animate-pulse rounded-md bg-muted" />
      <span className="sr-only">Loading the available solutions…</span>
    </div>
  );
}
