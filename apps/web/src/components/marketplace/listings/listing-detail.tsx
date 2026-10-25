"use client";

import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { RichEditor } from "@/components/editor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthUser } from "@/hooks/auth/use-auth";
import { useCreateBid, useListing, useWithdrawBid } from "@/hooks/marketplace/use-marketplace-flow";
import { timeAgo } from "@/components/marketplace/shared/time-ago";
import { formatCents } from "@/lib/format/money";
import { marketplaceApiMessage } from "@/lib/marketplace/api-errors";
import { cn } from "@/lib/utils";
import type { IBid } from "@/types";

const field =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Read-only RichEditor still requires an onChange; it never fires when not editable. */
const noop = () => {};

export function ListingDetail({ listingId }: { listingId: string }) {
  const { data: listing, isPending, isError, refetch } = useListing(listingId);
  const createBid = useCreateBid(listingId);
  const withdraw = useWithdrawBid(listingId);
  const { data: user } = useAuthUser();
  const [amount, setAmount] = useState("100");
  const [deliveryDays, setDeliveryDays] = useState("");
  const [message, setMessage] = useState("");
  const [bidError, setBidError] = useState<string | null>(null);
  const [submittedBid, setSubmittedBid] = useState<IBid | null>(null);

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-4 h-32 w-full" />
      </div>
    );
  }

  if (isError || !listing) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <EmptyState assetKey="error" title="Listing not found" actions={[{ label: "Retry", onClick: () => refetch() }]} />
      </div>
    );
  }

  const onBid = async () => {
    setBidError(null);
    const cents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setBidError("Enter a valid price.");
      return;
    }
    const days = deliveryDays.trim() ? parseInt(deliveryDays, 10) : null;
    try {
      const bid = await createBid.mutateAsync({
        amount_cents: cents,
        message,
        delivery_days: days && Number.isFinite(days) ? days : null,
      });
      setSubmittedBid(bid);
    } catch (err) {
      setBidError(marketplaceApiMessage(err, "Could not submit bid."));
    }
  };

  const onWithdraw = async () => {
    if (!submittedBid) return;
    setBidError(null);
    try {
      await withdraw.mutateAsync(submittedBid.id);
      setSubmittedBid(null);
    } catch (err) {
      setBidError(marketplaceApiMessage(err, "Could not withdraw bid."));
    }
  };

  const bidPlaced = Boolean(submittedBid);

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-6 py-8 lg:grid-cols-[1fr_320px]">
      <div>
        <p className="text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">GigsNano work</span>
          <span className="mx-2" aria-hidden>
            ·
          </span>
          Posted {timeAgo(listing.created_at)}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{listing.title}</h1>
        <div className="mt-4">
          {listing.description ? (
            // Read-only RichEditor: renders the authored HTML through TipTap's
            // schema (headings/lists/links/bold preserved, scripts dropped — safe
            // to show cross-workspace) with the shared .gn-prose styling.
            <RichEditor value={listing.description} onChange={noop} editable={false} />
          ) : (
            <p className="text-sm text-muted-foreground">No description provided.</p>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{listing.bid_count} proposal(s)</p>
      </div>

      <aside className="rounded-lg border p-4">
        <h2 className="font-medium">Place a bid</h2>
        <p className="mt-1 text-sm text-muted-foreground">Fixed price in USD. Platform fee is paid by the client.</p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bid-amount">Your price (USD)</Label>
            <input
              id="bid-amount"
              aria-label="Your price (USD)"
              inputMode="decimal"
              value={amount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
              className={field}
              disabled={bidPlaced}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bid-days">Delivery (days, optional)</Label>
            <input
              id="bid-days"
              aria-label="Delivery (days, optional)"
              inputMode="numeric"
              value={deliveryDays}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeliveryDays(e.target.value)}
              className={field}
              disabled={bidPlaced}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bid-message">Cover letter</Label>
            <textarea
              id="bid-message"
              aria-label="Cover letter"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={bidPlaced}
              className={cn(
                "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
            />
          </div>
          {bidError ? <p className="text-sm text-destructive">{bidError}</p> : null}
          {bidPlaced ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Bid submitted. Track contracts in{" "}
                <Link href="/marketplace/contracts" className="text-primary underline">
                  My contracts
                </Link>
                .
              </p>
              {submittedBid?.bidder_id === user?.id ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={withdraw.isPending}
                  onClick={() => void onWithdraw()}
                >
                  Withdraw bid
                </Button>
              ) : null}
            </div>
          ) : (
            <Button className="w-full" disabled={createBid.isPending} onClick={() => void onBid()}>
              {createBid.isPending
                ? "Submitting…"
                : `Submit bid · ${formatCents(Math.round(parseFloat(amount || "0") * 100))}`}
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
