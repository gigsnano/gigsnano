"use client";

import { EmptyState } from "@/components/empty-state";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useJourney } from "@/hooks/journey/use-journey";
import { deriveJourneyState } from "@/lib/journey/derive";

import { JourneyHome } from "./journey-home";

export function JourneyPage({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useJourney(workspaceSlug, projectId);

  if (isPending) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <SkeletonReveal isLoading className="h-8 w-56" skeleton={<div className="size-full rounded-md bg-card" />}>
          <div />
        </SkeletonReveal>
        <SkeletonReveal isLoading className="h-10" skeleton={<div className="size-full rounded-lg bg-card" />}>
          <div />
        </SkeletonReveal>
        <SkeletonReveal isLoading className="h-28" skeleton={<div className="size-full rounded-xl border bg-card" />}>
          <div />
        </SkeletonReveal>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonReveal key={i} isLoading className="h-11" skeleton={<div className="size-full rounded-lg bg-card" />}>
              <div />
            </SkeletonReveal>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Couldn't load the journey"
          description="Something went wrong loading this project's journey. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  if (!data || data.steps.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="board"
          title="Start your journey"
          description="This project doesn't have a guided journey yet. Create one to get a step-by-step route from idea to delivery."
          actions={[{ label: "Go to board", href: `/${workspaceSlug}/projects/${projectId}/board` }]}
        />
      </div>
    );
  }

  return (
    <JourneyHome
      journey={data}
      view={deriveJourneyState(data)}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
    />
  );
}
