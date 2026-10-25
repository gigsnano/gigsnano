"use client";

import { EmptyState } from "@/components/empty-state";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { useJourney } from "@/hooks/journey/use-journey";

import { AgentWorkspace } from "./agent-workspace";

export function AgentWorkspacePage({
  workspaceSlug,
  projectId,
  stepId,
}: {
  workspaceSlug: string;
  projectId: string;
  stepId: string;
}) {
  const { data, isPending, isError, refetch } = useJourney(workspaceSlug, projectId);
  const journeyHref = `/${workspaceSlug}/projects/${projectId}/journey`;

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <SkeletonReveal isLoading className="h-10" skeleton={<div className="size-full rounded-lg bg-card" />}>
          <div />
        </SkeletonReveal>
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr_20rem]">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonReveal key={i} isLoading className="h-72" skeleton={<div className="size-full rounded-xl border bg-card" />}>
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
          title="Couldn't load this step"
          description="Something went wrong loading the agent workspace. Please try again."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const step = data?.steps.find((s) => s.id === stepId);
  if (!data || !step) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="board"
          title="Step not found"
          description="This journey step doesn't exist or isn't available."
          actions={[{ label: "Back to journey", href: journeyHref }]}
        />
      </div>
    );
  }

  return <AgentWorkspace workspaceSlug={workspaceSlug} projectId={projectId} journey={data} step={step} />;
}
