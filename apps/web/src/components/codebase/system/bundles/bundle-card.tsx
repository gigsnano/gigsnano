"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Archive02Icon,
  Copy01Icon,
  Edit02Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BUNDLE_STATUS_META } from "@/constants/codebase-meta";
import { relativeTime } from "@/lib/format/relative-time";
import { cn } from "@/lib/utils";
import { EBundleStatus, type ISystemBundle } from "@/types";

export interface IBundleCardActions {
  onEdit: (bundle: ISystemBundle) => void;
  onDuplicate: (bundle: ISystemBundle) => void;
  onSetDefault: (bundle: ISystemBundle) => void;
  onArchive: (bundle: ISystemBundle) => void;
}

export function BundleCard({
  bundle,
  actions,
  index,
}: {
  bundle: ISystemBundle;
  actions: IBundleCardActions;
  index: number;
}) {
  const status = BUNDLE_STATUS_META[bundle.status];
  const canDefault = bundle.status === EBundleStatus.Valid && !bundle.is_default;

  return (
    <div
      className="space-y-3 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md animate-in fade-in-0 slide-in-from-bottom-1"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, animationDuration: "250ms" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-foreground">{bundle.name}</h3>
            {bundle.is_default ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Default
              </span>
            ) : null}
          </div>
          {bundle.description ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{bundle.description}</p>
          ) : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${bundle.name}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => actions.onEdit(bundle)}>
              <HugeiconsIcon icon={Edit02Icon} className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onDuplicate(bundle)}>
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            <SetDefaultItem enabled={canDefault} onSelect={() => actions.onSetDefault(bundle)} />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => actions.onArchive(bundle)}
              className="text-destructive focus:bg-destructive/10"
            >
              <HugeiconsIcon icon={Archive02Icon} className="size-3.5" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className={cn("inline-flex items-center gap-1 font-medium", status.tone)}>
          <HugeiconsIcon icon={status.icon} className="size-3.5" />
          {status.label}
        </span>
        <span>v{bundle.current_version}</span>
        <span>{bundle.repository_count} repos</span>
        <span>
          {bundle.write_count}W / {bundle.reference_count}R
        </span>
        <span>{bundle.affected_work_item_count} work items</span>
        <span className="ml-auto">{relativeTime(bundle.updated_at)}</span>
      </div>
    </div>
  );
}

/** Set default is only allowed for a Valid bundle — disabled with an explanatory tooltip. */
function SetDefaultItem({ enabled, onSelect }: { enabled: boolean; onSelect: () => void }) {
  if (enabled) {
    return <DropdownMenuItem onSelect={onSelect}>Set as default</DropdownMenuItem>;
  }
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <DropdownMenuItem disabled onSelect={(e) => e.preventDefault()}>
              Set as default
            </DropdownMenuItem>
          </div>
        </TooltipTrigger>
        <TooltipContent>Only a valid bundle can be set as default.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
