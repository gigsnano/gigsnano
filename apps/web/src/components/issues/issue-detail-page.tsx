"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { MobileHeader } from "@/components/layout/mobile-header";
import { OverviewPanel } from "@/components/issues/detail/v2/overview-panel";
import {
  ActivityPanel,
  DeliveryPanel,
  RunsPanel,
} from "@/components/issues/detail/v2/tab-panels";
import { WorkItemShell } from "@/components/issues/detail/v2/work-item-shell";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useStory } from "@/hooks/story/use-stories";
import { storyCode } from "@/lib/issues/issue-routes";
import { WORK_ITEM_DETAIL_V2 } from "@/lib/issues/work-item-detail-flag";
import { useWorkItemTab } from "@/hooks/issues/use-work-item-tab";
import { useWorkItemPropertiesStore } from "@/store/ui/work-item-properties.store";
import { useProject } from "@/hooks/project/use-projects";
import { useIssueNavigation } from "@/hooks/issues/use-issue-navigation";

import { IssueDetailView } from "./issue-detail-view";

export function IssueDetailPage({
  workspaceSlug,
  projectId,
  storyId,
  backHref,
  backLabel = "All issues",
  showProjectLink = false,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  backHref?: string;
  backLabel?: string;
  showProjectLink?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { goToTab } = useWorkItemTab();
  const openProperties = useWorkItemPropertiesStore((s) => s.open);
  const story = useStory(workspaceSlug, projectId, storyId);
  const project = useProject(workspaceSlug, projectId);

  const fromWorkItems = searchParams.get("from") === "work-items";
  const workItemsBase = `/${workspaceSlug}/work-items`;
  const issuesBase = `/${workspaceSlug}/projects/${projectId}/issues`;
  const resolvedBackHref = backHref ?? (fromWorkItems ? workItemsBase : issuesBase);
  const resolvedShowProject = showProjectLink || fromWorkItems;

  const navigation = useIssueNavigation(
    workspaceSlug,
    projectId,
    storyId,
    story.data?.cycle_id ?? undefined,
  );

  useEffect(() => {
    if (!story.data || story.data.bmad === null) return;
    router.replace(`/${workspaceSlug}/projects/${projectId}/board?openStory=${storyId}`);
  }, [story.data, storyId, projectId, router, workspaceSlug]);

  if (story.isPending || project.isPending) {
    return (
      <SkeletonReveal
        isLoading
        className="m-6 min-h-96"
        skeleton={<div className="size-full rounded-lg border bg-muted" />}
      >
        <div />
      </SkeletonReveal>
    );
  }

  if (story.isError || !story.data) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Issue not found"
          description="This issue doesn't exist or you don't have access."
          actions={[
            { label: backLabel, href: resolvedBackHref },
            { label: "Retry", onClick: () => story.refetch() },
          ]}
        />
      </div>
    );
  }

  if (story.data.bmad !== null) {
    return (
      <SkeletonReveal
        isLoading
        className="m-6 min-h-32"
        skeleton={<div className="size-full rounded-lg border bg-muted" />}
      >
        <div />
      </SkeletonReveal>
    );
  }

  const identifier = project.data?.identifier ?? "—";
  const key = storyCode(identifier, story.data);
  const cycleId = story.data.cycle_id ?? undefined;

  const openStory = (id: string) => {
    router.push(`/${workspaceSlug}/projects/${projectId}/issues/${id}`);
  };

  const openStoryPeek = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("peek", id);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  if (WORK_ITEM_DETAIL_V2) {
    const panelProps = { story: story.data, workspaceSlug, projectId };
    return (
      <>
        <MobileHeader backHref={resolvedBackHref} title={key} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <WorkItemShell
            story={story.data}
            code={key}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
            navigation={navigation}
            showProjectLink={resolvedShowProject}
            onNavigate={openStory}
            panels={{
              overview: (
                <OverviewPanel
                  story={story.data}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  cycleId={cycleId}
                  onOpenStory={openStory}
                  onOpenStoryPeek={openStoryPeek}
                  onGoToTab={goToTab}
                  onOpenProperties={openProperties}
                  autoBreakDown={searchParams.get("breakDown") === "1"}
                />
              ),
              runs: <RunsPanel {...panelProps} />,
              delivery: <DeliveryPanel {...panelProps} />,
              activity: <ActivityPanel {...panelProps} />,
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <MobileHeader backHref={resolvedBackHref} title={key} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <IssueDetailView
          story={story.data}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          showProjectLink={resolvedShowProject}
          onOpenStory={openStory}
          onOpenStoryPeek={openStoryPeek}
          navigation={navigation}
          autoBreakDown={searchParams.get("breakDown") === "1"}
        />
      </div>
    </>
  );
}
