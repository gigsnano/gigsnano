import Link from "next/link";

import type { IProject } from "@/types";

import { GANTT_ROW_HEIGHT } from "./gantt-config";

/** One chart row with an absolutely-positioned bar at {left,width} (px). */
export function GanttBarRow({
  project,
  left,
  width,
  workspaceSlug,
}: {
  project: IProject;
  left: number;
  width: number;
  workspaceSlug: string;
}) {
  return (
    <div className="relative border-b" style={{ height: GANTT_ROW_HEIGHT }}>
      <Link
        href={`/${workspaceSlug}/projects/${project.id}`}
        title={`${project.start_date} → ${project.target_date}`}
        className="absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md bg-primary/80 px-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary"
        style={{ left, width, height: GANTT_ROW_HEIGHT - 16 }}
      >
        <span className="truncate">{project.name}</span>
      </Link>
    </div>
  );
}
