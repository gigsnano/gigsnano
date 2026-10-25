"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format/relative-time";
import {
  findSolution,
  isDraftStale,
  isSolutionSelectable,
  startingPointLabel,
} from "@/lib/solutions/registry";
import { draftDisplayName } from "@/lib/solutions/setup-values";
import { solutionPresentation } from "@/constants/solutions";
import type { ISetupDraft, ISolutionRegistry } from "@/types";

/**
 * "Continue setup" — the resumable drafts on the chooser (GIN-446). A draft is
 * proof that opening the flow created nothing: it holds the step and answers
 * while no container exists.
 *
 * Discard is two-step in place rather than a nested dialog: a confirm dialog on
 * top of the chooser dialog is the modal-over-modal pattern this app avoids.
 */
export function SetupDraftList({
  drafts,
  registry,
  onResume,
  onDiscard,
  discardingId,
}: {
  drafts: ISetupDraft[];
  registry: ISolutionRegistry;
  onResume: (draft: ISetupDraft) => void;
  onDiscard: (draft: ISetupDraft) => void;
  discardingId: string | null;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (drafts.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Continue setup
      </h3>
      <ul className="flex flex-col gap-1.5">
        {drafts.map((draft) => {
          const solution = findSolution(registry, draft.solution_key);
          const { icon, tile } = solutionPresentation(draft.solution_key);
          // A draft whose solution was switched off, or whose definition moved on,
          // can be discarded but not resumed — resuming would replay answers
          // against rules that no longer apply.
          const stale = solution ? isDraftStale(draft, solution) : true;
          const resumable = Boolean(solution) && !stale && isSolutionSelectable(solution!);
          const confirming = confirmingId === draft.id;
          const solutionName = solution?.name ?? draft.solution_key;
          const typedName = draftDisplayName(draft.values);
          const startedFrom = startingPointLabel(solution, draft.starting_point);

          return (
            <li
              key={draft.id}
              className="flex items-center gap-3 rounded-md border bg-card/50 px-3 py-2"
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tile}`}
              >
                <HugeiconsIcon icon={icon} className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{typedName ?? solutionName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {resumable
                    ? [typedName ? solutionName : startedFrom, `edited ${relativeTime(draft.updated_at)}`]
                        .filter(Boolean)
                        .join(" · ")
                    : stale
                      ? "Setup questions changed — start again"
                      : "This solution is no longer enabled"}
                </p>
              </div>
              {confirming ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingId(null)}
                  >
                    Keep
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={discardingId === draft.id}
                    onClick={() => {
                      onDiscard(draft);
                      setConfirmingId(null);
                    }}
                  >
                    {discardingId === draft.id ? "Discarding…" : "Discard"}
                  </Button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  {resumable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Resume ${typedName ?? solutionName}`}
                      onClick={() => onResume(draft)}
                    >
                      Resume
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setConfirmingId(draft.id)}
                    aria-label={`Discard the ${typedName ?? solutionName} setup draft`}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
