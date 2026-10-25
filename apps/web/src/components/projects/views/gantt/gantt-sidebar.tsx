import Link from "next/link";

import type { IProject } from "@/types";
import { ProjectLogo } from "@/components/projects/project-logo";

import { GANTT_HEADER_HEIGHT, GANTT_ROW_HEIGHT, GANTT_SIDEBAR_CSS_WIDTH } from "./gantt-config";
import { getDurationDays } from "./gantt-date-math";

/** Fixed-width left rail: a "Duration" header cell then one name+duration row per project. */
export function GanttSidebar({
  projects,
  workspaceSlug,
}: {
  projects: IProject[];
  workspaceSlug: string;
}) {
  return (
    <div className="shrink-0 border-r bg-background" style={{ width: GANTT_SIDEBAR_CSS_WIDTH }}>
      <div
        className="flex items-center justify-end border-b px-3 text-xs font-medium text-muted-foreground"
        style={{ height: GANTT_HEADER_HEIGHT }}
      >
        Duration
      </div>
      {projects.map((project) => {
        const days = getDurationDays(project);
        return (
          <div
            key={project.id}
            className="flex items-center gap-2 border-b px-3"
            style={{ height: GANTT_ROW_HEIGHT }}
          >
            <ProjectLogo project={project} size="sm" />
            <Link
              href={`/${workspaceSlug}/projects/${project.id}`}
              className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
            >
              {project.name}
            </Link>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {days} {days === 1 ? "day" : "days"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
