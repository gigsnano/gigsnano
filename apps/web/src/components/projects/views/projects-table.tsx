import Link from "next/link";

import { cn } from "@/lib/utils";
import { ESprintZeroStatus, type IProject } from "@/types";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { ProjectLogo } from "@/components/projects/project-logo";

const STATUS_LABEL: Record<ESprintZeroStatus, string> = {
  [ESprintZeroStatus.NotStarted]: "Not started",
  [ESprintZeroStatus.InProgress]: "In progress",
  [ESprintZeroStatus.Complete]: "Complete",
};

export function ProjectsTable({
  projects,
  workspaceSlug,
}: {
  projects: IProject[];
  workspaceSlug: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">ID</th>
            <th className="px-4 py-2.5 font-medium">Members</th>
            <th className="px-4 py-2.5 font-medium">Sprint-0</th>
            <th className="px-4 py-2.5 font-medium">Progress</th>
            <th className="px-4 py-2.5 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id} className="border-b last:border-0 transition-colors hover:bg-accent/40">
              <td className="px-4 py-2.5">
                <Link
                  href={`/${workspaceSlug}/projects/${project.id}`}
                  className="flex items-center gap-2 font-medium text-foreground hover:underline"
                >
                  <ProjectLogo project={project} size="sm" />
                  <span className="truncate">{project.name}</span>
                </Link>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{project.identifier}</td>
              <td className="px-4 py-2.5">
                <AvatarGroup members={project.members} total={project.member_count} max={3} size="xs" />
              </td>
              <td className="px-4 py-2.5">
                <span
                  className={cn(
                    "text-xs",
                    project.sprint_zero_status === ESprintZeroStatus.Complete
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {STATUS_LABEL[project.sprint_zero_status]}
                </span>
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{project.sprint_zero_progress}%</td>
              <td className="px-4 py-2.5 text-muted-foreground">
                {new Date(project.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
