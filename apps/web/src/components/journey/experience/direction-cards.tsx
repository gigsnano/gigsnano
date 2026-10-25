import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { DIRECTIONS, type IDirection } from "@/lib/journey/experience";

const RECOMMENDED = "focused";

/** Direction tab — 2–3 meaningfully different directions to compare and pick. */
export function DirectionCards({
  directionId,
  onSelect,
}: {
  directionId: string;
  onSelect: (direction: IDirection) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Visual direction</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Three meaningfully different directions. Pick one to apply its character, then fine-tune tokens.
        </p>
      </div>
      <div className="space-y-2">
        {DIRECTIONS.map((d) => {
          const active = directionId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(d)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.99]",
                active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60",
              )}
            >
              <span
                className="mt-0.5 size-9 shrink-0 rounded-lg"
                style={{ background: d.tokens.accent, borderRadius: d.tokens.radius }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{d.name}</span>
                  {d.id === RECOMMENDED ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      Recommended
                    </span>
                  ) : null}
                  {active ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="ml-auto size-4 text-primary" /> : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{d.blurb}</span>
                <span className="mt-1 block text-[11px] capitalize text-muted-foreground/80">
                  {d.tokens.density} · {d.tokens.typography} · radius {d.tokens.radius}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
