"use client";

import { useState } from "react";
import Link from "next/link";

import { PublishListingDialog } from "@/components/marketplace/listings/publish-listing-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useWorkspaceContracts,
  useWorkspaceListings,
} from "@/hooks/marketplace/use-marketplace-flow";
import { useWorkspaceAdmin } from "@/hooks/workspace/use-workspace-admin";
import { EContractStatus, EListingStatus } from "@/types";

import { ContractActionsPanel, ListingBidsPanel } from "./contract-console";

/** Owner marketplace panel for a single story (issue detail sidebar). */
export function IssueMarketplacePanel({
  workspaceSlug,
  projectId: _projectId,
  storyId,
  defaultTitle,
  defaultDescription = "",
}: {
  workspaceSlug: string;
  projectId: string;
  storyId: string;
  defaultTitle: string;
  defaultDescription?: string;
}) {
  const { isAdmin, isPending: adminPending } = useWorkspaceAdmin(workspaceSlug);
  const listings = useWorkspaceListings(workspaceSlug);
  const contracts = useWorkspaceContracts(workspaceSlug);
  const [publishOpen, setPublishOpen] = useState(false);

  if (adminPending || !isAdmin) return null;

  if (listings.isPending || contracts.isPending) {
    return (
      <section className="mb-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-20 w-full" />
      </section>
    );
  }

  const listing = listings.data?.find((l) => l.story_id === storyId);
  const contract = contracts.data?.find(
    (c) =>
      c.story_id === storyId &&
      c.status !== EContractStatus.Cancelled &&
      c.status !== EContractStatus.Completed,
  );

  return (
    <section className="mb-6 border-b border-border/50 pb-6">
      <h3 className="text-sm font-medium text-foreground">Marketplace</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Hire a freelancer for this work item.</p>

      {contract ? (
        <div className="mt-3">
          <ContractActionsPanel workspaceSlug={workspaceSlug} contract={contract} compact />
        </div>
      ) : listing && listing.status === EListingStatus.Open ? (
        <div className="mt-3">
          <p className="text-sm font-medium">{listing.title}</p>
          <p className="text-xs text-muted-foreground">Listing open · {listing.bid_count} bid(s)</p>
          <ListingBidsPanel workspaceSlug={workspaceSlug} listing={listing} />
        </div>
      ) : listing ? (
        <p className="mt-3 text-sm text-muted-foreground capitalize">
          Listing {listing.status.replace("_", " ")}.
          {" "}
          <Link href={`/${workspaceSlug}/settings/hired-work`} className="text-primary underline">
            Hired work
          </Link>
        </p>
      ) : (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setPublishOpen(true)}
          >
            Publish to marketplace
          </Button>
        </div>
      )}

      <PublishListingDialog
        workspaceSlug={workspaceSlug}
        storyId={storyId}
        defaultTitle={defaultTitle}
        defaultDescription={defaultDescription}
        open={publishOpen}
        onOpenChange={setPublishOpen}
      />
    </section>
  );
}
