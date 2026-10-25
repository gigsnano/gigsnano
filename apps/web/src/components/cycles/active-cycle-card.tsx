"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { useCycleProgress } from "@/hooks/project/use-cycles";
import { cn } from "@/lib/utils";
import type { ICycle } from "@/types";

import { CycleRowMeta } from "./cycle-row-meta";
import { CycleBreakdownPanel } from "./cycle-breakdown-panel";
import { CycleBurndownChart } from "./cycle-burndown-chart";

export function ActiveCycleCard({
  cycle,
  workspaceSlug,
  projectId,
  defaultExpanded = false,
}: {
  cycle: ICycle;
  workspaceSlug: string;
  projectId: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { data: progress, isPending } = useCycleProgress(workspaceSlug, projectId, cycle.id);

  return (
    <div className="border-b">
      {/* Row */}
      <div className="group relative flex cursor-pointer items-center gap-2 px-4 py-3 transition-colors hover:bg-accent/50">
        <button
          type="button"
          aria-label={expanded ? "Collapse cycle" : "Expand cycle"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="relative z-[1] flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className={cn("size-4 transition-transform duration-200", expanded && "rotate-90")}
          />
        </button>

        <Link
          href={`/${workspaceSlug}/projects/${projectId}/cycles/${cycle.id}`}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground after:absolute after:inset-0 group-hover:underline"
        >
          {cycle.name}
        </Link>

        <div className="relative z-[1]">
          <CycleRowMeta cycle={cycle} progress={progress} workspaceSlug={workspaceSlug} projectId={projectId} />
        </div>
      </div>

      {/* Expanded body */}
      {expanded ? (
        <div className="px-4 pb-6 pt-1">
          {isPending || !progress ? (
            <div className="h-56 animate-pulse rounded-lg bg-muted/50" />
          ) : (
            <div className="flex flex-col gap-6 md:flex-row">
              <CycleBreakdownPanel progress={progress} />
              <CycleBurndownChart data={progress.burndown} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
