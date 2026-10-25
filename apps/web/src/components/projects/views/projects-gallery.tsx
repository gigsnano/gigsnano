import type { IProject } from "@/types";

import { ProjectCard } from "../project-card";

export function ProjectsGallery({
  projects,
  workspaceSlug,
}: {
  projects: IProject[];
  workspaceSlug: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          href={`/${workspaceSlug}/projects/${project.id}`}
        />
      ))}
    </div>
  );
}
