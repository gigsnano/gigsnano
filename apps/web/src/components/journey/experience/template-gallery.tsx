import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { TEMPLATES } from "@/lib/journey/experience";

/** Templates tab — structural starting points, recommended with reasons (not ranking). */
export function TemplateGallery({
  templateId,
  onSelect,
}: {
  templateId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Start from a template</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Structural starting points, not themes. Preview before selecting — nothing is applied silently.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const active = templateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(t.id)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.99]",
                active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{t.name}</span>
                {active ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-primary" /> : null}
              </span>
              <span className="text-xs text-muted-foreground">{t.blurb}</span>
              <span className="mt-1 text-[11px] text-muted-foreground/80">Fit: {t.fit}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
