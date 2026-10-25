"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PanelLeftOpenIcon, PanelRightOpenIcon } from "@hugeicons/core-free-icons";

import { useProject } from "@/hooks/project/use-projects";
import { useUpdateProject } from "@/hooks/project/use-project-settings";
import { useOverviewPanelStore } from "@/store/ui/overview-panel.store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/ui/use-media-query";
import { minWidth } from "@/lib/layout/breakpoints";
import { EmptyState } from "@/components/empty-state";
import type { IUpdateProjectPayload } from "@/types";

import { ProjectHero } from "./overview/project-hero";
import { OverviewEditor } from "./overview/overview-editor";
import { ProjectProgress } from "./overview/project-progress";
// ponytail: Health & forecast is temporarily disabled — it renders incorrect
// figures. `overview/project-health.tsx` is untouched; restore by uncommenting
// this import and its one mount below.
// import { ProjectHealth } from "./overview/project-health";
import { ProjectCycle } from "./overview/project-cycle";
import { ProjectDelivery } from "./overview/project-delivery";
import { ProjectRisks } from "./overview/project-risks";
import { PmHealthPanel } from "./overview/pm-health";
import { OverviewRail } from "./overview/overview-rail";
import { CloneStatusBanner } from "./github/clone-status-banner";

export function ProjectOverview({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: project, isPending, isError } = useProject(workspaceSlug, projectId);
  const update = useUpdateProject(workspaceSlug, projectId);
  const collapsed = useOverviewPanelStore((s) => s.collapsed);
  const setCollapsed = useOverviewPanelStore((s) => s.setCollapsed);
  // Below lg the rail is a sheet; it can't stay open once the column is back.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const wide = useMediaQuery(minWidth("lg"));

  const onChange = (payload: IUpdateProjectPayload) => update.mutate(payload);

  if (isPending) {
    return <div className="m-6 h-64 animate-pulse rounded-xl border bg-muted" />;
  }

  if (isError || !project) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Project not found"
          description="This project doesn't exist or you don't have access."
          actions={[{ label: "All projects", href: `/${workspaceSlug}/projects` }]}
        />
      </div>
    );
  }

  return (
    // Below lg there is no room for main + a 320px rail side by side: the rail
    // opens as a sheet from the details button instead.
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* Main column */}
      <div className="relative min-w-0 lg:flex-1 lg:overflow-y-auto">
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Expand panel"
            onClick={() => setCollapsed(false)}
            className="absolute right-3 top-3 z-10 max-lg:hidden"
          >
            <HugeiconsIcon icon={PanelLeftOpenIcon} className="size-4" />
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Project details"
          aria-haspopup="dialog"
          onClick={() => setDetailsOpen(true)}
          className="absolute right-3 top-3 z-10 bg-background/85 backdrop-blur-sm lg:hidden"
        >
          <HugeiconsIcon icon={PanelRightOpenIcon} className="size-4" />
        </Button>

        <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-4">
          <CloneStatusBanner workspaceSlug={workspaceSlug} projectId={projectId} />
          <ProjectHero project={project} onChange={onChange} />
          <OverviewEditor project={project} onChange={onChange} />
          <ProjectProgress workspaceSlug={workspaceSlug} projectId={projectId} />
          {/* Disabled — see the ProjectHealth import above. */}
          <ProjectCycle workspaceSlug={workspaceSlug} projectId={projectId} />
          <ProjectDelivery workspaceSlug={workspaceSlug} projectId={projectId} />
          <ProjectRisks workspaceSlug={workspaceSlug} projectId={projectId} />
          <PmHealthPanel workspaceSlug={workspaceSlug} projectId={projectId} />
        </div>
      </div>

      {/* Right rail (lg+) */}
      {!collapsed ? (
        <OverviewRail workspaceSlug={workspaceSlug} projectId={projectId} project={project} />
      ) : null}

      {/* Below lg: the same rail as a right sheet. */}
      <Sheet open={detailsOpen && !wide} onOpenChange={setDetailsOpen}>
        <SheetContent className="max-w-sm [--tw-ease:var(--ease-drawer)] data-[state=closed]:[--tw-duration:180ms] data-[state=open]:[--tw-duration:220ms]">
          <OverviewRail
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            project={project}
            variant="sheet"
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
