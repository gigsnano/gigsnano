"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { ESprintZeroStatus, type IProject } from "@/types";
import { ProjectLogo } from "@/components/projects/project-logo";

import { HomeSection } from "./home-section";

const SPRINT_ZERO_LABEL: Record<ESprintZeroStatus, string> = {
  [ESprintZeroStatus.NotStarted]: "Not started",
  [ESprintZeroStatus.InProgress]: "Sprint-0 in progress",
  [ESprintZeroStatus.Complete]: "Sprint-0 complete",
};

function ProjectCard({
  project,
  href,
  index,
}: {
  project: IProject;
  href: string;
  index: number;
}) {
  const pct = Math.max(0, Math.min(100, project.sprint_zero_progress));
  const done = project.sprint_zero_status === ESprintZeroStatus.Complete;

  return (
    <Link
      href={href}
      style={{ "--i": index } as CSSProperties}
      className="t-home-rise t-card-lift flex flex-col gap-3 rounded-xl border bg-card p-4 active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <ProjectLogo project={project} size="md" className="rounded-lg bg-muted" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{project.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {SPRINT_ZERO_LABEL[project.sprint_zero_status]}
          </p>
        </div>
      </div>

      <div className="mt-auto">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{project.identifier}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              done ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

/** Workspace projects as compact cards with their Sprint-0 progress. */
export function HomeProjects({
  workspaceSlug,
  projects,
}: {
  workspaceSlug: string;
  projects: IProject[];
}) {
  return (
    <HomeSection
      title="Projects"
      count={projects.length}
      viewAllHref={`/${workspaceSlug}/projects`}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {projects.map((p, i) => (
          <ProjectCard
            key={p.id}
            project={p}
            index={i}
            href={`/${workspaceSlug}/projects/${p.id}`}
          />
        ))}
      </div>
    </HomeSection>
  );
}
