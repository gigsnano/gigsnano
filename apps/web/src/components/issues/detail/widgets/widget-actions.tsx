"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  AttachmentIcon,
  GitBranchIcon,
  Link01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const chipClass = cn(
  "inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs font-medium text-muted-foreground",
  "transition-[color,background-color,border-color,transform] duration-150 ease-out",
  "hover:border-border hover:bg-accent hover:text-foreground active:scale-[0.97]",
);

/** Plane-style widget chip row below the description. */
export function IssueWidgetActions({
  onCreateSubWork,
  onAddExistingSubWork,
  onAttach,
  onAddLink,
  onAddRelation,
  hideSubWork = false,
}: {
  onCreateSubWork: () => void;
  onAddExistingSubWork: () => void;
  onAttach: () => void;
  onAddLink: () => void;
  onAddRelation: () => void;
  hideSubWork?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!hideSubWork ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={chipClass}>
              <HugeiconsIcon icon={GitBranchIcon} className="size-3.5" />
              Add sub-work item
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem onSelect={onCreateSubWork}>
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
              Create new
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAddExistingSubWork}>
              <HugeiconsIcon icon={Link01Icon} className="size-3.5" />
              Add existing
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <button type="button" onClick={onAddRelation} className={chipClass}>
        <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
        Add relation
      </button>
      <button type="button" onClick={onAddLink} className={chipClass}>
        <HugeiconsIcon icon={Link01Icon} className="size-3.5" />
        Add link
      </button>
      <button type="button" onClick={onAttach} className={chipClass}>
        <HugeiconsIcon icon={AttachmentIcon} className="size-3.5" />
        Attach
      </button>
    </div>
  );
}
