"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Menu01Icon,
  KanbanIcon,
  Calendar03Icon,
  GridViewIcon,
  ChartGanttIcon,
  ChartNetworkIcon,
  ArrowDown01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";
import { useIssuesViewStore, type EIssueLayout } from "@/store/ui/issues-view.store";

const LAYOUTS: { id: EIssueLayout; label: string; icon: IconSvgElement }[] = [
  { id: "list", label: "List", icon: Menu01Icon },
  { id: "kanban", label: "Board", icon: KanbanIcon },
  { id: "calendar", label: "Calendar", icon: Calendar03Icon },
  { id: "spreadsheet", label: "Spreadsheet", icon: GridViewIcon },
  { id: "gantt", label: "Gantt", icon: ChartGanttIcon },
  { id: "graph", label: "Graph", icon: ChartNetworkIcon },
];

/** Work Items view switcher — segmented control (wide) collapses to a dropdown (narrow). */
export function IssuesViewSwitcher() {
  const layout = useIssuesViewStore((s) => s.layout);
  const setLayout = useIssuesViewStore((s) => s.setLayout);

  const activeIndex = LAYOUTS.findIndex((l) => l.id === layout);
  const activeLayout = LAYOUTS[Math.max(0, activeIndex)];
  const { barRef, pillRef } = useSlidingTabs(Math.max(0, activeIndex));

  return (
    <>
      <div
        ref={barRef}
        className="relative hidden items-center rounded-lg border bg-muted/40 p-0.5 @min-[44rem]/hdr:flex"
      >
        <span
          ref={pillRef}
          className="t-issues-pill pointer-events-none absolute inset-y-0.5 left-0 rounded-md bg-background shadow-sm"
          aria-hidden
        />
        {LAYOUTS.map((l, i) => (
          <button
            key={l.id}
            type="button"
            data-tab-index={i}
            aria-label={l.label}
            aria-pressed={layout === l.id}
            title={l.label}
            onClick={() => setLayout(l.id)}
            className={cn(
              "relative z-[1] flex size-7 items-center justify-center rounded-md transition-colors duration-150 active:scale-95",
              layout === l.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={l.icon} className="size-4" />
          </button>
        ))}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="@min-[44rem]/hdr:hidden" aria-label={`View: ${activeLayout.label}`}>
            <HugeiconsIcon icon={activeLayout.icon} className="size-4" />
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {LAYOUTS.map((l) => (
            <DropdownMenuItem key={l.id} onSelect={() => setLayout(l.id)}>
              <HugeiconsIcon icon={l.icon} className="size-4" />
              <span className="flex-1">{l.label}</span>
              {layout === l.id ? (
                <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
