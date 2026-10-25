import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/** Illustrative option sets for the shell — a real step would source these from the agent run. */
const OPTIONS: Record<string, string[]> = {
  Direction: ["A · Calm enterprise", "B · Focused modern", "C · Dense operations"],
  Theme: ["Light", "Dark", "System"],
  Density: ["Comfortable", "Compact"],
};

function optionsFor(label: string, recommended?: string): string[] {
  const base = OPTIONS[label] ?? ["Option A", "Option B", "Option C"];
  // Ensure the recommended value is always selectable even if not in the base set.
  return recommended && !base.includes(recommended) ? [recommended, ...base] : base;
}

/**
 * Region 3 — interactive decision surface. Agent questions render as typed
 * controls; every selection is recorded as a durable decision (GIN-433).
 */
export function DecisionSurface({
  decisions,
  selected,
  onSelect,
}: {
  decisions: { label: string; value?: string }[];
  selected: Record<string, string>;
  onSelect: (label: string, value: string) => void;
}) {
  const made = decisions.filter((d) => selected[d.label]).length;

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Decisions</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {made}/{decisions.length} made
        </span>
      </div>

      {decisions.map((decision) => {
        const options = optionsFor(decision.label, decision.value);
        const chosen = selected[decision.label];
        return (
          <fieldset key={decision.label} className="space-y-1.5">
            <legend className="text-xs font-medium text-muted-foreground">{decision.label}</legend>
            <div className="flex flex-col gap-1.5">
              {options.map((opt) => {
                const isChosen = chosen === opt;
                const isRecommended = decision.value === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={isChosen}
                    onClick={() => onSelect(decision.label, opt)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.99]",
                      isChosen
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border hover:bg-muted/60",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border",
                          isChosen ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                        )}
                      >
                        {isChosen ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" /> : null}
                      </span>
                      {opt}
                    </span>
                    {isRecommended ? (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        Recommended
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
