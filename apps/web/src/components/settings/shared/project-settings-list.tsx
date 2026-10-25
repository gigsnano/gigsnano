"use client";

import Link from "next/link";

import { useProjects } from "@/hooks/project/use-projects";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectSettingsList({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useProjects(workspaceSlug);

  if (isPending) {
    return (
      <ul className="divide-y rounded-lg border">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex items-center justify-between px-4 py-3">
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-16" />
          </li>
        ))}
      </ul>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load projects"
        description="Something went wrong fetching projects."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  if (!data?.length) {
    return (
      <EmptyState
        assetKey="project"
        title="No projects yet"
        description="Create a project first, then configure its features, labels, and workflow states here."
        actions={[{ label: "Go to projects", href: `/${workspaceSlug}/projects` }]}
      />
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {data.map((p) => (
        <li key={p.id}>
          <Link
            href={`/${workspaceSlug}/settings/projects/${p.id}`}
            className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-accent/40"
          >
            <div>
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.identifier}</p>
            </div>
            <span className="text-xs text-muted-foreground">Configure →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
