"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon } from "@hugeicons/core-free-icons";

import type { IProject } from "@/types";
import { ProjectLogo } from "@/components/projects/project-logo";
import { ProjectContextMenu } from "./project-context-menu";

/**
 * A single-line project row in the workspace panel. Clicking drills into the
 * project (Rail B swaps to ProjectPanelNav) — rows never expand inline.
 */
export function ProjectRow({
  workspaceSlug,
  project,
  favorite = false,
  onNavigate,
}: {
  workspaceSlug: string;
  project: IProject;
  favorite?: boolean;
  /** Flyout usage passes this to close the extended sidebar after navigating. */
  onNavigate?: () => void;
}) {
  return (
    <div className="group/row flex items-center gap-1 rounded-md pr-1 transition-colors duration-150 hover:bg-sidebar-accent/40">
      {/* min-w-0 on the link AND the label is what lets the name truncate
          instead of pushing the ⋯ trigger out of the rail. */}
      <Link
        href={`/${workspaceSlug}/projects/${project.id}`}
        onClick={() => onNavigate?.()}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-muted-foreground outline-none group-hover/row:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ProjectLogo project={project} size="xs" />
        <span title={project.name} className="min-w-0 flex-1 truncate">
          {project.name}
        </span>
        {favorite ? (
          <>
            <HugeiconsIcon icon={StarIcon} aria-hidden className="size-3.5 shrink-0 opacity-70" />
            <span className="sr-only">Favorite</span>
          </>
        ) : null}
      </Link>
      <ProjectContextMenu workspaceSlug={workspaceSlug} project={project} />
    </div>
  );
}
