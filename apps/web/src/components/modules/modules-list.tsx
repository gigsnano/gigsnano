"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Layers01Icon } from "@hugeicons/core-free-icons";

import { useModules } from "@/hooks/project/use-modules";
import { useProjectFeatureFlags } from "@/hooks/project/use-project-settings";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { EModuleStatus, type IModule } from "@/types";

import { CreateModuleDialog } from "./create-module-dialog";

const STATUS_LABEL: Record<EModuleStatus, string> = {
  [EModuleStatus.Backlog]: "Backlog",
  [EModuleStatus.Planned]: "Planned",
  [EModuleStatus.InProgress]: "In progress",
  [EModuleStatus.Completed]: "Completed",
};

function ModuleCard({ module, href }: { module: IModule; href: string }) {
  const pct = module.story_count
    ? Math.round((module.completed_story_count / module.story_count) * 100)
    : 0;

  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-ring/60 hover:bg-accent/40"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <HugeiconsIcon icon={Layers01Icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{module.name}</h3>
          <p className="line-clamp-2 text-xs text-muted-foreground">{module.description}</p>
        </div>
      </div>

      <div className="mt-auto">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{STATUS_LABEL[module.status]}</span>
          <span>{module.completed_story_count}/{module.story_count}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full bg-primary transition-all")} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Link>
  );
}

export function ModulesList({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) {
  const { modules: modulesEnabled, isPending: flagsPending } = useProjectFeatureFlags(
    workspaceSlug,
    projectId,
  );
  const { data: modules, isPending, isError, refetch } = useModules(workspaceSlug, projectId);

  if (!flagsPending && !modulesEnabled) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="module"
          title="Modules are disabled"
          description="Turn on Modules in project settings to group stories by feature area."
          actions={[
            {
              label: "Project settings",
              href: `/${workspaceSlug}/settings/projects/${projectId}/features`,
            },
          ]}
        />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load modules"
        description="Something went wrong fetching modules. Please try again."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  if (modules.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <EmptyState
          assetKey="module"
          title="No modules yet"
          description="Group related stories into modules to track larger initiatives and features across sprints."
        />
        <CreateModuleDialog workspaceSlug={workspaceSlug} projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            href={`/${workspaceSlug}/projects/${projectId}/modules/${module.id}`}
          />
        ))}
      </div>
    </div>
  );
}
