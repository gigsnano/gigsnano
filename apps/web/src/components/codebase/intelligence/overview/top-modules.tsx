import { useState } from "react";
import { PackageIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { CodebaseViewId } from "@/types/code/intelligence";
import type { IModulesSection } from "@/types/code/overview";

import { fmt } from "./overview-lib";
import { SectionCard } from "./section-card";

type Metric = "symbols" | "files";

/** GIN-278 — leading modules by symbols or files (both are real index counts, so
 * the toggle never fabricates a metric). Files are labelled files and symbols
 * symbols — never mislabelled. Clicking a module opens the Modules view. */
export function TopModules({
  modules,
  onOpenView,
  index = 0,
}: {
  modules: IModulesSection;
  onOpenView: (view: CodebaseViewId) => void;
  index?: number;
}) {
  const [metric, setMetric] = useState<Metric>("symbols");
  const items = [...modules.items].sort((a, b) => b[metric] - a[metric]).slice(0, 6);
  const max = items.reduce((m, x) => Math.max(m, x[metric]), 0) || 1;

  return (
    <SectionCard
      title="Top modules"
      icon={PackageIcon}
      provenance={modules}
      index={index}
      action={
        modules.items.length ? (
          <div className="flex items-center rounded-md border p-0.5" role="group" aria-label="Rank by">
            {(["symbols", "files"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                aria-pressed={metric === m}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  metric === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">{modules.detail ?? "No modules indexed yet."}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((m) => (
            <li key={m.key}>
              <button
                type="button"
                onClick={() => onOpenView("modules")}
                className="group flex w-full items-center gap-3 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="w-32 shrink-0 truncate text-xs font-medium">{m.name}</span>
                <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/70 transition-[width] duration-500"
                    style={{ width: `${(m[metric] / max) * 100}%` }}
                  />
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-[11px] text-muted-foreground">
                  {fmt(m[metric])}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
