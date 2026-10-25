import { Suspense } from "react";

import { StoryAssistantPage } from "@/components/ai/story-assistant-page";

export default async function ProjectIssueAssistantPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string; storyId: string }>;
}) {
  const { workspaceSlug, projectId, storyId } = await params;

  return (
    <Suspense fallback={<div className="m-6 h-32 animate-pulse rounded-lg border bg-muted" />}>
      <StoryAssistantPage workspaceSlug={workspaceSlug} projectId={projectId} storyId={storyId} />
    </Suspense>
  );
}
