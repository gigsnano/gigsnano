"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon, ViewIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import { SPREADSHEET_COLUMN_META } from "@/lib/issues/spreadsheet-columns";

/** Show/hide + count the spreadsheet's property columns (spreadsheet layout only). */
export function SpreadsheetColumnsMenu() {
  const columns = useIssuesViewStore((s) => s.spreadsheetColumns);
  const toggle = useIssuesViewStore((s) => s.toggleSpreadsheetColumn);
  const reset = useIssuesViewStore((s) => s.resetSpreadsheetColumns);
  const shown = columns.filter((c) => c.visible).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Show or hide columns">
          <HugeiconsIcon icon={ViewIcon} className="size-4" />
          <span className="hidden @min-[52rem]/hdr:inline">Columns</span>
          <span className="ml-0.5 text-[10px] tabular-nums text-muted-foreground">{shown}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-52 overflow-y-auto">
        {columns.map((column) => (
          <DropdownMenuItem
            key={column.key}
            onSelect={(e) => {
              e.preventDefault(); // keep the menu open while toggling several columns
              toggle(column.key);
            }}
          >
            <span className="flex-1">{SPREADSHEET_COLUMN_META[column.key].label}</span>
            {column.visible ? (
              <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-muted-foreground" />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => reset()}>Reset columns</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
