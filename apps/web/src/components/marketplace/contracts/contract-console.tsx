"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptBid,
  useApproveContract,
  useCancelContract,
  useListingBids,
  useRequestChanges,
} from "@/hooks/marketplace/use-marketplace-flow";
import { formatCents } from "@/lib/format/money";
import { marketplaceApiMessage } from "@/lib/marketplace/api-errors";
import { APIError } from "@/services/api-error";
import type { IBid, IContract, IListing } from "@/types";
import { EBidStatus, EContractStatus } from "@/types";

import { WalletTopUpDialog } from "./wallet-top-up-dialog";

function BidAcceptRow({
  workspaceSlug,
  listing,
  bid,
}: {
  workspaceSlug: string;
  listing: IListing;
  bid: IBid;
}) {
  const accept = useAcceptBid(workspaceSlug, listing.id);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const retryBidId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (bid.status !== EBidStatus.Pending) return null;

  const onAccept = async (bidId: string) => {
    setError(null);
    try {
      await accept.mutateAsync(bidId);
    } catch (err) {
      if (err instanceof APIError && err.status === 402) {
        retryBidId.current = bidId;
        setTopUpOpen(true);
        return;
      }
      setError(marketplaceApiMessage(err, "Could not accept bid."));
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div>
          <p className="font-medium">{bid.bidder_name ?? "Freelancer"}</p>
          <p className="text-sm text-muted-foreground">{bid.message || "No message"}</p>
          <p className="mt-1 text-sm tabular-nums">
            {formatCents(bid.amount_cents)}
            {bid.delivery_days ? ` · ${bid.delivery_days} days` : null}
          </p>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
        <Button size="sm" disabled={accept.isPending} onClick={() => void onAccept(bid.id)}>
          Accept
        </Button>
      </div>
      <WalletTopUpDialog
        workspaceSlug={workspaceSlug}
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        onToppedUp={() => {
          if (retryBidId.current) void onAccept(retryBidId.current);
        }}
      />
    </>
  );
}

export function ListingBidsPanel({
  workspaceSlug,
  listing,
}: {
  workspaceSlug: string;
  listing: IListing;
}) {
  const bids = useListingBids(workspaceSlug, listing.id);
  if (bids.isPending) return <Skeleton className="mt-3 h-16 w-full" />;
  const pending = bids.data?.filter((b) => b.status === EBidStatus.Pending) ?? [];
  if (!pending.length) {
    return <p className="mt-2 text-sm text-muted-foreground">No pending bids yet.</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      {pending.map((bid) => (
        <BidAcceptRow key={bid.id} workspaceSlug={workspaceSlug} listing={listing} bid={bid} />
      ))}
    </div>
  );
}

export function ContractActionsPanel({
  workspaceSlug,
  contract,
  compact = false,
}: {
  workspaceSlug: string;
  contract: IContract;
  compact?: boolean;
}) {
  const approve = useApproveContract(workspaceSlug, contract.id);
  const requestChanges = useRequestChanges(workspaceSlug, contract.id);
  const cancel = useCancelContract(workspaceSlug, contract.id);
  const [approveError, setApproveError] = useState<string | null>(null);

  const onApprove = async () => {
    setApproveError(null);
    try {
      await approve.mutateAsync();
    } catch (err) {
      setApproveError(
        marketplaceApiMessage(err, "Could not approve. The freelancer may need to finish payout setup."),
      );
    }
  };

  return (
    <div className={compact ? "rounded-lg border p-3" : "rounded-lg border p-4"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{contract.listing_title ?? "Contract"}</p>
          <p className="text-sm capitalize text-muted-foreground">{contract.status.replace("_", " ")}</p>
          <p className="mt-1 text-sm tabular-nums">
            {formatCents(contract.bid_cents)} + {formatCents(contract.fee_cents)} fee
          </p>
          {approveError ? <p className="mt-2 text-xs text-destructive">{approveError}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {contract.status === EContractStatus.Delivered ? (
            <>
              <Button size="sm" disabled={approve.isPending} onClick={() => void onApprove()}>
                Approve & pay
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={requestChanges.isPending}
                onClick={() => void requestChanges.mutateAsync()}
              >
                Request changes
              </Button>
            </>
          ) : null}
          {contract.status === EContractStatus.InProgress ? (
            <Button
              size="sm"
              variant="outline"
              disabled={cancel.isPending}
              onClick={() => void cancel.mutateAsync()}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
      {!compact ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <Link href={`/${workspaceSlug}/settings/hired-work`} className="text-primary underline">
            View all hired work
          </Link>
        </p>
      ) : null}
    </div>
  );
}
