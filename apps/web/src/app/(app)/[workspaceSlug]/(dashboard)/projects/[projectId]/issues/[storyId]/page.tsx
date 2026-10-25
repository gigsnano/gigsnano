import { Suspense } from "react";
import { redirect } from "next/navigation";

import { IssueDetailPage } from "@/components/issues/issue-detail-page";
import { WorkItemDetailSkeleton } from "@/components/issues/detail/v2/work-item-detail-skeleton";
import { WORK_ITEM_DETAIL_V2 } from "@/lib/issues/work-item-detail-flag";
import { canonicalTabParam } from "@/lib/issues/work-item-tabs";

export default async function ProjectIssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; storyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceSlug, projectId, storyId } = await params;
  const query = await searchParams;

  // A retired tab name canonicalises here rather than in an effect, so an old
  // `?tab=execute` link never paints the wrong tab first (GIN-479).
  const rawTab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const canonical = canonicalTabParam(rawTab);
  if (WORK_ITEM_DETAIL_V2 && canonical) {
    const next = new URLSearchParams(
      Object.entries(query).flatMap(([k, v]): [string, string][] =>
        v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]],
      ),
    );
    next.set("tab", canonical);
    redirect(`/${workspaceSlug}/projects/${projectId}/issues/${storyId}?${next.toString()}`);
  }

  return (
    <Suspense
      fallback={
        WORK_ITEM_DETAIL_V2 ? (
          <WorkItemDetailSkeleton />
        ) : (
          <div className="m-6 h-32 animate-pulse rounded-lg border bg-muted" />
        )
      }
    >
      <IssueDetailPage workspaceSlug={workspaceSlug} projectId={projectId} storyId={storyId} />
    </Suspense>
  );
}
