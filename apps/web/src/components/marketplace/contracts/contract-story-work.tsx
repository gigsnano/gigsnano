"use client";

import { StoryChat } from "@/components/board";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useContractDocuments,
  useContractStories,
} from "@/hooks/marketplace/use-marketplace-flow";
import { useStoryDocuments } from "@/hooks/docs/use-documents";
import { useStory } from "@/hooks/story/use-stories";

/** Scoped BMAD agent chat for a hired freelancer (contract route — not workspace shell). */
export function ContractStoryWork({
  contractId,
  workspaceSlug,
  projectId,
  storyId,
}: {
  contractId: string;
  workspaceSlug: string;
  projectId: string;
  storyId: string;
}) {
  const story = useStory(workspaceSlug, projectId, storyId);
  const { data: storyDocs } = useStoryDocuments(workspaceSlug, projectId, storyId);
  const projectDocuments = useContractDocuments(contractId);
  const scopedStories = useContractStories(contractId);

  if (story.isPending) {
    return <Skeleton className="mt-6 h-[28rem] w-full rounded-lg" />;
  }

  if (story.isError || !story.data) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Could not load this work item. Try again from My contracts.
      </p>
    );
  }

  if (!story.data.bmad) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Complete the scoped work described in the listing, then mark the contract delivered.
      </p>
    );
  }

  const { agent, artifact } = story.data.bmad;

  return (
    <section className="mt-6 flex min-h-[28rem] flex-col overflow-hidden rounded-lg border">
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-sm font-medium">Complete with {agent}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Use the BMAD agent workflow to produce{" "}
          <span className="font-mono">{artifact}</span>, then mark the contract delivered when
          finished.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <StoryChat
          story={story.data}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          storyDocuments={storyDocs ?? []}
          projectDocuments={projectDocuments.data ?? []}
          scopedStories={scopedStories.data ?? []}
        />
      </div>
    </section>
  );
}
