"use client";

import { KanbanBoard } from "@/components/board";
import { Skeleton } from "@/components/ui/skeleton";
import { useContractDocuments, useContractStories } from "@/hooks/marketplace/use-marketplace-flow";

/** Sprint-0 cycle board for a hired freelancer — scoped stories + BMAD agent chat. */
export function ContractCycleWork({
  contractId,
  workspaceSlug,
  projectId,
  cycleId,
}: {
  contractId: string;
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
}) {
  const stories = useContractStories(contractId);
  const projectDocuments = useContractDocuments(contractId);

  if (stories.isPending) {
    return <Skeleton className="mt-6 h-[28rem] w-full rounded-lg" />;
  }

  if (stories.isError) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Could not load cycle work items. Try again from My contracts.
      </p>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-lg border">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium">Sprint-0 planning board</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Open unlocked BMAD steps and complete them with the owning agent. Mark the contract
          delivered when the scoped work is finished.
        </p>
      </div>
      <div className="min-h-[28rem]">
        <KanbanBoard
          stories={stories.data ?? []}
          isPending={false}
          isError={false}
          refetch={() => void stories.refetch()}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          cycleId={cycleId}
          enableAgentChat
          enableDragDrop={false}
          showAssigneeFilter={false}
          cardVariant="sprint"
          projectDocuments={projectDocuments.data ?? []}
          scopedStories={stories.data ?? []}
          emptyTitle="No work items"
          emptyDescription="This cycle has no stories in scope."
        />
      </div>
    </section>
  );
}
