"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Rocket01Icon, Calendar03Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { ICycle } from "@/types";

import { CycleRowMeta } from "./cycle-row-meta";

export function CycleListRow({
  cycle,
  workspaceSlug,
  projectId,
}: {
  cycle: ICycle;
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <div className="group relative flex cursor-pointer items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-accent/50">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md",
          cycle.is_sprint_zero ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <HugeiconsIcon icon={cycle.is_sprint_zero ? Rocket01Icon : Calendar03Icon} className="size-3.5" />
      </span>
      <Link
        href={`/${workspaceSlug}/projects/${projectId}/cycles/${cycle.id}`}
        className="min-w-0 flex-1 truncate text-sm font-medium text-foreground after:absolute after:inset-0 group-hover:underline"
      >
        {cycle.name}
      </Link>
      <div className="relative z-[1]">
        <CycleRowMeta cycle={cycle} workspaceSlug={workspaceSlug} projectId={projectId} />
      </div>
    </div>
  );
}
