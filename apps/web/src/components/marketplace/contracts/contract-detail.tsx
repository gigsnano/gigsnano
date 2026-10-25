"use client";

import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthUser } from "@/hooks/auth/use-auth";
import {
  useContract,
  useDeliverContract,
} from "@/hooks/marketplace/use-marketplace-flow";
import { formatCents } from "@/lib/format/money";
import { contractWorkHref } from "@/lib/marketplace/contract-work-href";
import { EContractStatus } from "@/types";

import { ContractActionsPanel } from "./contract-console";
import { ContractStoryWork } from "./contract-story-work";
import { ContractCycleWork } from "./contract-cycle-work";

export function ContractDetailPage({ contractId }: { contractId: string }) {
  const { data: user } = useAuthUser();
  const { data: contract, isPending, isError, refetch } = useContract(contractId);
  const deliver = useDeliverContract(contractId);

  if (isPending) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-32 w-full" />
      </div>
    );
  }

  if (isError || !contract) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <EmptyState assetKey="error" title="Contract not found" actions={[{ label: "Retry", onClick: () => refetch() }]} />
      </div>
    );
  }

  const isFreelancer = user?.id === contract.freelancer_id;
  const isOwner = !isFreelancer && Boolean(contract.workspace_slug);

  const showStoryAgentWork =
    isFreelancer &&
    contract.status === EContractStatus.InProgress &&
    Boolean(contract.workspace_slug && contract.project_id && contract.story_id);

  const showCycleAgentWork =
    isFreelancer &&
    contract.status === EContractStatus.InProgress &&
    Boolean(contract.workspace_slug && contract.project_id && contract.cycle_id && !contract.story_id);

  const showOwnerActions =
    isOwner &&
    contract.workspace_slug &&
    (contract.status === EContractStatus.InProgress ||
      contract.status === EContractStatus.Delivered);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <p className="text-sm text-muted-foreground">
        <Link href="/marketplace/contracts" className="text-primary underline">
          My contracts
        </Link>
      </p>
      <h1 className="mt-2 text-xl font-semibold">{contract.listing_title ?? "Contract"}</h1>
      <p className="mt-1 text-sm capitalize text-muted-foreground">{contract.status.replace("_", " ")}</p>
      <p className="mt-2 text-sm tabular-nums">{formatCents(contract.bid_cents)}</p>

      {showOwnerActions ? (
        <div className="mt-6">
          <ContractActionsPanel
            workspaceSlug={contract.workspace_slug!}
            contract={contract}
            compact
          />
        </div>
      ) : null}

      {showStoryAgentWork ? (
        <ContractStoryWork
          contractId={contract.id}
          workspaceSlug={contract.workspace_slug!}
          projectId={contract.project_id!}
          storyId={contract.story_id!}
        />
      ) : null}

      {showCycleAgentWork ? (
        <ContractCycleWork
          contractId={contract.id}
          workspaceSlug={contract.workspace_slug!}
          projectId={contract.project_id!}
          cycleId={contract.cycle_id!}
        />
      ) : null}

      {isFreelancer && contract.status === EContractStatus.InProgress ? (
        <Button className="mt-6" disabled={deliver.isPending} onClick={() => void deliver.mutateAsync()}>
          Mark delivered
        </Button>
      ) : null}

      {!showStoryAgentWork && !showCycleAgentWork && contract.story_id && isFreelancer ? (
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href={contractWorkHref(contract)} className="text-primary underline">
            View contract
          </Link>
        </p>
      ) : null}
    </div>
  );
}
