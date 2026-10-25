import { Suspense } from "react";

import { IssuesView } from "@/components/issues/issues-view";

export default async function ProjectIssuesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;

  return (
    <Suspense fallback={<div className="m-4 h-32 animate-pulse rounded-lg border bg-muted" />}>
      <div className="flex h-full min-h-0 flex-col">
        <IssuesView workspaceSlug={workspaceSlug} projectId={projectId} />
      </div>
    </Suspense>
  );
}
