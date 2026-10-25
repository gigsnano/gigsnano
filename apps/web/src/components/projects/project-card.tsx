import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { ESprintZeroStatus, type IProject } from "@/types";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { ProjectCoverImage } from "@/components/projects/project-cover-image";
import { ProjectLogo } from "@/components/projects/project-logo";

const SPRINT_ZERO_LABEL: Record<ESprintZeroStatus, string> = {
  [ESprintZeroStatus.NotStarted]: "Sprint-0 not started",
  [ESprintZeroStatus.InProgress]: "Sprint-0 in progress",
  [ESprintZeroStatus.Complete]: "Sprint-0 complete",
};

export function ProjectCard({ project, href }: { project: IProject; href: string }) {
  const complete = project.sprint_zero_status === ESprintZeroStatus.Complete;

  return (
    <Link
      href={href}
      className="group t-card-lift flex flex-col overflow-hidden rounded-lg border bg-card"
    >
      {/* Cover */}
      <div className="relative aspect-[16/7] w-full">
        <div className="absolute inset-0 overflow-hidden bg-muted">
          <ProjectCoverImage
            src={project.cover_image_url}
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <ProjectLogo
          project={project}
          size="md"
          className="absolute -bottom-4 left-4 border bg-card shadow-sm"
        />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4 pt-6">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{project.name}</h3>
          <p className="line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <AvatarGroup members={project.members} total={project.member_count} max={4} size="xs" />
            <span className={cn("flex items-center gap-1.5", complete && "text-primary")}>
              {complete ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" /> : null}
              {SPRINT_ZERO_LABEL[project.sprint_zero_status]}
              {!complete && project.sprint_zero_progress > 0
                ? ` · ${project.sprint_zero_progress}%`
                : ""}
            </span>
          </div>
          {!complete && project.sprint_zero_progress > 0 ? (
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={project.sprint_zero_progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Sprint-0 progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${project.sprint_zero_progress}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="aspect-[16/7] w-full animate-pulse bg-muted" />
      <div className="flex flex-col gap-3 p-4 pt-6">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="mt-2 flex -space-x-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="size-6 animate-pulse rounded-full bg-muted ring-2 ring-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
