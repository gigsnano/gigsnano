"use client";

import Link from "next/link";

import { ConnectOnboardingCard } from "@/components/billing/connect-onboarding-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeliverContract, useMyContracts } from "@/hooks/marketplace/use-marketplace-flow";
import { formatCents } from "@/lib/format/money";
import { contractWorkHref } from "@/lib/marketplace/contract-work-href";
import type { IContract } from "@/types";
import { EContractStatus } from "@/types";

function ContractRow({ contract }: { contract: IContract }) {
  const deliver = useDeliverContract(contract.id);
  const workHref = contractWorkHref(contract);
  const inProgress = contract.status === EContractStatus.InProgress;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{contract.listing_title ?? "Contract"}</p>
          <p className="text-sm capitalize text-muted-foreground">{contract.status.replace("_", " ")}</p>
          <p className="mt-1 text-sm tabular-nums">{formatCents(contract.bid_cents)}</p>
        </div>
        {inProgress ? (
          <Button size="sm" disabled={deliver.isPending} onClick={() => void deliver.mutateAsync()}>
            Mark delivered
          </Button>
        ) : null}
      </div>
      {inProgress ? (
        <p className="mt-3 text-sm">
          <Link href={workHref} className="text-primary underline">
          {contract.story_id ? "Work with BMAD agent" : contract.cycle_id ? "Open Sprint-0 board" : "Open contract"}
          </Link>
        </p>
      ) : (
        <p className="mt-3 text-sm">
          <Link href={workHref} className="text-primary underline">
            View contract
          </Link>
        </p>
      )}
    </div>
  );
}

export function MyContractsPage() {
  const { data, isPending, isError, refetch } = useMyContracts("freelancer");

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-24 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <EmptyState assetKey="error" title="Could not load contracts" actions={[{ label: "Retry", onClick: () => refetch() }]} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold">My contracts</h1>
      <p className="mt-1 text-sm text-muted-foreground">Work you were hired for through the marketplace.</p>

      <div className="mt-6">
        <ConnectOnboardingCard />
      </div>

      <div className="mt-6 space-y-3">
        {data?.length ? (
          data.map((c) => <ContractRow key={c.id} contract={c} />)
        ) : (
          <EmptyState
            assetKey="generic"
            title="No contracts yet"
            description="Browse open listings and place a bid to get started."
            actions={[{ label: "Find work", href: "/marketplace" }]}
          />
        )}
      </div>
    </div>
  );
}
