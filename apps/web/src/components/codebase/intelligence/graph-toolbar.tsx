"use client";

import {
  ArrowExpand01Icon,
  ArrowShrink02Icon,
  Cancel01Icon,
  FilterHorizontalIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { emptyFilters, hasActiveFilters, type ICodebaseFilters } from "@/lib/code/graph-filter";
import { nodeTypeMeta } from "@/lib/code/node-type";
import type { CodeNodeType, ERiskLevel } from "@/types/code/intelligence";

export type TGraphLayout = "force" | "layered" | "sequence";

const NODE_TYPES: CodeNodeType[] = [
  "module", "file", "class", "function", "api", "table", "test", "external",
];
const RISKS: ERiskLevel[] = ["low", "medium", "high"];
const LAYOUTS: { id: TGraphLayout; label: string }[] = [
  { id: "force", label: "Force" },
  { id: "layered", label: "Layered" },
  { id: "sequence", label: "Sequence" },
];

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

/** Filter + layout controls above the graph. Filters feed the typed-graph views
 * (Dependencies / *-flow); layout applies to every graph view. */
export function GraphToolbar({
  filters,
  onFilters,
  layout,
  onLayout,
  modules,
  onToggleFullscreen,
  isFullscreen = false,
}: {
  filters: ICodebaseFilters;
  onFilters: (f: ICodebaseFilters) => void;
  layout: TGraphLayout;
  onLayout: (l: TGraphLayout) => void;
  modules: { key: string; name: string }[];
  /** GIN-121 — omit to render no expand control (the toolbar stays usable). */
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}) {
  const active = hasActiveFilters(filters);
  return (
    <div className="flex items-center gap-1.5 border-b bg-card/70 px-2 py-1.5 backdrop-blur">
      <div className="relative w-44">
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={filters.query}
          onChange={(e) => onFilters({ ...filters, query: e.target.value })}
          placeholder="Search graph…"
          aria-label="Search graph"
          className="w-full rounded-md border bg-background py-1 pl-7 pr-2 text-xs outline-none transition-colors focus:border-primary/50"
        />
      </div>

      <FilterPopover label="Type" count={filters.nodeTypes.size}>
        {NODE_TYPES.map((t) => (
          <CheckRow
            key={t}
            label={nodeTypeMeta(t).label}
            checked={filters.nodeTypes.has(t)}
            onToggle={() => onFilters({ ...filters, nodeTypes: toggle(filters.nodeTypes, t) })}
          />
        ))}
      </FilterPopover>

      <FilterPopover label="Module" count={filters.modules.size}>
        {modules.map((m) => (
          <CheckRow
            key={m.key}
            label={m.name}
            checked={filters.modules.has(m.key)}
            onToggle={() => onFilters({ ...filters, modules: toggle(filters.modules, m.key) })}
          />
        ))}
      </FilterPopover>

      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <button
                type="button"
                disabled
                aria-label="Relationship filter (disabled)"
                className="flex cursor-not-allowed items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground/50"
              >
                <HugeiconsIcon icon={FilterHorizontalIcon} className="size-3.5" />
                Relationship
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Requires typed relationships (backend edge-typing)</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <FilterPopover label="Risk" count={filters.risk ? 1 : 0}>
        {RISKS.map((rk) => (
          <CheckRow
            key={rk}
            label={rk}
            checked={filters.risk === rk}
            onToggle={() => onFilters({ ...filters, risk: filters.risk === rk ? undefined : rk })}
          />
        ))}
      </FilterPopover>

      <div className="ml-auto flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onLayout(l.id)}
            className={cn(
              "rounded px-2 py-0.5 text-xs transition-colors",
              layout === l.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      {active ? (
        <button
          type="button"
          onClick={() => onFilters(emptyFilters())}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          Clear
        </button>
      ) : null}

      {/* Always-visible rather than hover-revealed (GIN-121): on a graph this
          dense, going full screen is the first thing you reach for, not a
          flourish to discover. */}
      {onToggleFullscreen ? (
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit full screen" : "Expand graph to full screen"}
          title={isFullscreen ? "Exit full screen" : "Full screen"}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
        >
          <HugeiconsIcon
            icon={isFullscreen ? ArrowShrink02Icon : ArrowExpand01Icon}
            className="size-3.5"
          />
        </button>
      ) : null}
    </div>
  );
}

function FilterPopover({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent",
            count > 0 && "border-primary/50 bg-accent",
          )}
        >
          <HugeiconsIcon icon={FilterHorizontalIcon} className="size-3.5 text-muted-foreground" />
          {label}
          {count > 0 ? <span className="tabular-nums font-medium text-primary">{count}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-48 overflow-y-auto p-1">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function CheckRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs capitalize transition-colors hover:bg-accent"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-3.5 items-center justify-center rounded border text-[9px] leading-none",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
        )}
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}
