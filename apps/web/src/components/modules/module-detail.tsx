"use client";

import Link from "next/link";

import { CreateWorkItemModal, KanbanBoard } from "@/components/board";
import { EditModuleDialog } from "@/components/modules/edit-module-dialog";
import { EmptyState } from "@/components/empty-state";
import { MobileHeader } from "@/components/layout/mobile-header";
import { FeatureDisabledGuard } from "@/components/projects/feature-disabled-guard";
import { useModule } from "@/hooks/project/use-modules";
import { useModuleStories } from "@/hooks/story/use-stories";

export function ModuleDetail({
  workspaceSlug,
  projectId,
  moduleId,
}: {
  workspaceSlug: string;
  projectId: string;
  moduleId: string;
}) {
  return (
    <FeatureDisabledGuard workspaceSlug={workspaceSlug} projectId={projectId} feature="modules">
      <ModuleDetailContent workspaceSlug={workspaceSlug} projectId={projectId} moduleId={moduleId} />
    </FeatureDisabledGuard>
  );
}

function ModuleDetailContent({
  workspaceSlug,
  projectId,
  moduleId,
}: {
  workspaceSlug: string;
  projectId: string;
  moduleId: string;
}) {
  const mod = useModule(workspaceSlug, projectId, moduleId);
  const stories = useModuleStories(workspaceSlug, projectId, moduleId);

  if (mod.isPending) {
    return <div className="m-6 h-40 animate-pulse rounded-lg border bg-muted" />;
  }

  if (mod.isError || !mod.data) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Module not found"
          description="This module doesn't exist or you don't have access."
          actions={[{ label: "Back to modules", href: `/${workspaceSlug}/projects/${projectId}/modules` }]}
        />
      </div>
    );
  }

  const m = mod.data;
  const pct = m.story_count ? Math.round((m.completed_story_count / m.story_count) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <MobileHeader
        backHref={`/${workspaceSlug}/projects/${projectId}/modules`}
        title={m.name}
      />
      <div className="shrink-0 border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{m.name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>
            <div className="mt-3 max-w-md">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>
                  {m.completed_story_count}/{m.story_count} stories complete
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CreateWorkItemModal
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              moduleId={moduleId}
            />
            <EditModuleDialog module={m} workspaceSlug={workspaceSlug} projectId={projectId} />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <KanbanBoard
          stories={stories.data ?? []}
          isPending={stories.isPending}
          isError={stories.isError}
          refetch={stories.refetch}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          enableAgentChat
          enableDragDrop
          showAssigneeFilter
          emptyTitle="No stories linked yet"
          emptyDescription="Stories are linked to modules during epic breakdown in Sprint-0."
          emptyAction={{
            label: "Open Sprint-0 board",
            href: `/${workspaceSlug}/projects/${projectId}/board`,
          }}
        />
      </div>

      <p className="shrink-0 border-t px-6 py-2 text-xs text-muted-foreground">
        <Link
          href={`/${workspaceSlug}/projects/${projectId}/cycles`}
          className="text-primary hover:underline"
        >
          View all sprints
        </Link>
      </p>
    </div>
  );
}
