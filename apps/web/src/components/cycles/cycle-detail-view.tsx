"use client";

import { EmptyState } from "@/components/empty-state";
import { IssuesView } from "@/components/issues/issues-view";
import { MobileHeader } from "@/components/layout/mobile-header";
import { FeatureDisabledGuard } from "@/components/projects/feature-disabled-guard";
import { useCycle } from "@/hooks/project/use-cycles";

export function CycleDetailView({
  workspaceSlug,
  projectId,
  cycleId,
}: {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
}) {
  return (
    <FeatureDisabledGuard workspaceSlug={workspaceSlug} projectId={projectId} feature="cycles">
      <CycleDetailContent workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />
    </FeatureDisabledGuard>
  );
}

function CycleDetailContent({
  workspaceSlug,
  projectId,
  cycleId,
}: {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
}) {
  const cycle = useCycle(workspaceSlug, projectId, cycleId);

  if (cycle.isPending) {
    return <div className="m-6 h-32 animate-pulse rounded-lg border bg-muted" />;
  }

  if (cycle.isError || !cycle.data) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Sprint not found"
          description="This sprint doesn't exist or you don't have access."
          actions={[{ label: "Back to sprints", href: `/${workspaceSlug}/projects/${projectId}/cycles` }]}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MobileHeader
        backHref={`/${workspaceSlug}/projects/${projectId}/cycles`}
        title={cycle.data.name}
      />
      <div className="min-h-0 flex-1">
        <IssuesView workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />
      </div>
    </div>
  );
}
