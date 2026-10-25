import { StructureIcon } from "@hugeicons/core-free-icons";

import { communityColor } from "@/lib/code/community-color";
import { cn } from "@/lib/utils";
import type { CodebaseViewId } from "@/types/code/intelligence";
import type { IModulesSection } from "@/types/code/overview";

import { fmt } from "./overview-lib";
import { SectionCard } from "./section-card";

/** GIN-275 — a readable, high-level architecture map: the module/domain landscape
 * as a proportional band (size = symbol share), legible at a glance with no zoom or
 * pan. The dense node-level dependency graph stays a deep-dive — "Open graph" hands
 * off to the Dependencies explorer. Deterministic for a given indexed commit (the
 * backend orders modules by symbol count). */
export function ArchitectureMap({
  modules,
  onOpenView,
  index = 0,
}: {
  modules: IModulesSection;
  onOpenView: (view: CodebaseViewId) => void;
  index?: number;
}) {
  const items = modules.items;
  const total = items.reduce((sum, m) => sum + m.symbols, 0) || 1;

  return (
    <SectionCard
      title="Architecture map"
      icon={StructureIcon}
      provenance={modules}
      index={index}
      action={
        items.length ? (
          <button
            type="button"
            onClick={() => onOpenView("dependencies")}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          >
            Open graph
          </button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          {modules.detail ?? "No modules indexed yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {/* Proportional band — the shape of the codebase in one line. */}
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`Module size distribution across ${items.length} modules`}
          >
            {items.map((m) => (
              <span
                key={m.key}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(m.symbols / total) * 100}%`, background: communityColor(m.key) }}
                title={`${m.name} · ${fmt(m.symbols)} symbols`}
              />
            ))}
          </div>

          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {items.slice(0, 8).map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => onOpenView("modules")}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: communityColor(m.key) }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{m.name}</span>
                  <span className={cn("shrink-0 tabular-nums text-[11px] text-muted-foreground")}>
                    {fmt(m.symbols)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
