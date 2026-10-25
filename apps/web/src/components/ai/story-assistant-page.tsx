"use client";

import { useRouter } from "next/navigation";

import { StoryAssistantShell } from "@/components/ai/story-assistant-shell";
import { EmptyState } from "@/components/empty-state";
import { MobileHeader } from "@/components/layout/mobile-header";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useStory } from "@/hooks/story/use-stories";

export function StoryAssistantPage({
  workspaceSlug,
  projectId,
  storyId,
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
}) {
  const router = useRouter();
  const story = useStory(workspaceSlug, projectId, storyId);
  const backHref = `/${workspaceSlug}/projects/${projectId}/issues/${storyId}`;

  if (story.isPending) {
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
          description="This work item doesn't exist or you don't have access."
          actions={[{ label: "Back to issues", href: `/${workspaceSlug}/projects/${projectId}/issues` }]}
        />
      </div>
    );
  }

  return (
    <>
      <MobileHeader backHref={backHref} title={story.data.title} />
      <div className="flex min-h-0 flex-1 flex-col">
        <StoryAssistantShell
          story={story.data}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          onBack={() => router.push(backHref)}
        />
      </div>
    </>
  );
}
