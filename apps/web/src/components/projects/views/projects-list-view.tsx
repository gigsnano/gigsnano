import Link from "next/link";

import type { IProject } from "@/types";
import { ProjectCoverImage } from "@/components/projects/project-cover-image";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { ProjectLogo } from "@/components/projects/project-logo";

export function ProjectsListView({
  projects,
  workspaceSlug,
}: {
  projects: IProject[];
  workspaceSlug: string;
}) {
  return (
    <div className="flex flex-col divide-y rounded-lg border">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/${workspaceSlug}/projects/${project.id}`}
          className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/40"
        >
          <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
            <ProjectCoverImage
              src={project.cover_image_url}
              fill
              sizes="40px"
              className="object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <ProjectLogo project={project} size="sm" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
            <p className="truncate text-xs text-muted-foreground">{project.description}</p>
          </div>
          <AvatarGroup members={project.members} total={project.member_count} max={3} size="xs" />
        </Link>
      ))}
    </div>
  );
}
