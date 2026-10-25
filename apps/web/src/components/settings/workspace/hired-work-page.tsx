"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ContractActionsPanel, ListingBidsPanel } from "@/components/marketplace/contracts/contract-console";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceContracts, useWorkspaceListings } from "@/hooks/marketplace/use-marketplace-flow";
import { useWallet } from "@/hooks/billing/use-wallet";
import { formatCents } from "@/lib/format/money";
import { EContractStatus, EListingStatus } from "@/types";

export function HiredWorkPage({ workspaceSlug }: { workspaceSlug: string }) {
  const searchParams = useSearchParams();
  const highlightListingId = searchParams.get("listing");
  const listings = useWorkspaceListings(workspaceSlug);
  const contracts = useWorkspaceContracts(workspaceSlug);
  const wallet = useWallet(workspaceSlug);

  const openListings = listings.data?.filter((l) => l.status === EListingStatus.Open) ?? [];
  const activeContracts =
    contracts.data?.filter(
      (c) =>
        c.status !== EContractStatus.Completed && c.status !== EContractStatus.Cancelled,
    ) ?? [];

  if (listings.isPending || contracts.isPending) {
    return (
      <div className="max-w-2xl px-10 py-8">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-6 h-24 w-full" />
      </div>
    );
  }

  if (listings.isError || contracts.isError) {
    return (
      <div className="px-10 py-8">
        <EmptyState
          assetKey="error"
          title="Could not load hired work"
          actions={[{ label: "Retry", onClick: () => listings.refetch() }]}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">Hired work</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage marketplace listings, bids, and active contracts for this workspace.
      </p>

      {wallet.data ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Wallet: {formatCents(wallet.data.available_cents)} available ·{" "}
          {formatCents(wallet.data.held_cents)} held in escrow.{" "}
          <Link href={`/${workspaceSlug}/settings/billing`} className="text-primary underline">
            Top up
          </Link>
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Open listing bids
        </h2>
        {openListings.length ? (
          openListings.map((listing) => (
            <div
              key={listing.id}
              id={`listing-${listing.id}`}
              className={
                highlightListingId === listing.id
                  ? "mt-3 rounded-lg ring-2 ring-primary/40 ring-offset-2"
                  : "mt-3"
              }
            >
              <p className="text-sm font-medium">{listing.title}</p>
              <ListingBidsPanel workspaceSlug={workspaceSlug} listing={listing} />
            </div>
          ))
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No open listings — publish a work item or cycle from its detail page.
          </p>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Contracts</h2>
        {activeContracts.length ? (
          activeContracts.map((c) => (
            <ContractActionsPanel key={c.id} workspaceSlug={workspaceSlug} contract={c} />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No active contracts yet.</p>
        )}
      </section>
    </div>
  );
}
