import { APIError } from "@/services/api-error";
import type { IAuthUser, IDocument, IStory } from "@/types";
import {
  EBidStatus,
  EContractStatus,
  EListingStatus,
  type IBid,
  type IContract,
  type IListing,
  type IPublishListingPayload,
} from "@/types/marketplace/listing";

import { documents } from "../data/documents";
import { allStories } from "../data/stories";
import { walletBySlug } from "../data/wallet";
import { workspaces } from "../data/workspaces";

type Handler = {
  method: string;
  pattern: RegExp;
  resolve: (match: RegExpMatchArray, body: unknown, query: URLSearchParams) => unknown;
};

const clone = <T>(value: T): T => structuredClone(value);
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

const PLATFORM_FEE_BPS = 2000;

function feeCents(bidCents: number) {
  return Math.round((bidCents * PLATFORM_FEE_BPS) / 10_000);
}

export const marketplaceListings: IListing[] = [];
export const marketplaceBids: IBid[] = [];
const marketplaceContracts: IContract[] = [];

function listingOut(listing: IListing): IListing {
  return {
    ...listing,
    bid_count: marketplaceBids.filter(
      (b) => b.listing_id === listing.id && b.status === EBidStatus.Pending,
    ).length,
  };
}

function contractOut(contract: IContract): IContract {
  const listing = marketplaceListings.find((l) => l.id === contract.listing_id);
  const ws = workspaces.find((w) => w.id === contract.workspace_id);
  let projectId: string | null = null;
  let storyId = listing?.story_id ?? null;
  let cycleId = listing?.cycle_id ?? null;
  if (listing?.story_id) {
    const story = allStories.find((s) => s.id === listing.story_id);
    projectId = story?.project_id ?? null;
  } else if (listing?.cycle_id) {
    const story = allStories.find((s) => s.cycle_id === listing.cycle_id);
    projectId = story?.project_id ?? null;
  }
  return {
    ...contract,
    workspace_slug: ws?.slug ?? contract.workspace_slug,
    listing_title: listing?.title ?? contract.listing_title,
    project_id: projectId,
    story_id: storyId,
    cycle_id: cycleId,
  };
}

function scopedStories(contract: IContract): IStory[] {
  const listing = marketplaceListings.find((l) => l.id === contract.listing_id);
  if (!listing) return [];
  if (listing.story_id) {
    const story = allStories.find((s) => s.id === listing.story_id);
    return story ? [story] : [];
  }
  if (listing.cycle_id) {
    return allStories.filter((s) => s.cycle_id === listing.cycle_id);
  }
  return [];
}

function scopedDocuments(contract: IContract): IDocument[] {
  const out = contractOut(contract);
  if (!out.project_id) return [];
  return documents.filter((d) => d.project_id === out.project_id);
}

function assertContractReader(contract: IContract, user: IAuthUser | null) {
  if (!user) throw new APIError(401, "Unauthorized");
  if (contract.freelancer_id === user.id) return;
  const ws = workspaces.find((w) => w.id === contract.workspace_id);
  if (ws?.slug === "acme" && user.email === "ada@example.test") return;
  throw new APIError(403, "Not allowed");
}

export function makeMarketplaceFlowHandlers(getUser: () => IAuthUser | null): Handler[] {
  return [
    {
      method: "GET",
      pattern: /^\/marketplace\/listings\/$/,
      resolve: () => clone(marketplaceListings.filter((l) => l.status !== EListingStatus.Closed).map(listingOut)),
    },
    {
      method: "GET",
      pattern: /^\/marketplace\/listings\/([^/]+)\/$/,
      resolve: ([, listingId]) => {
        const listing = marketplaceListings.find((l) => l.id === listingId);
        if (!listing) throw new APIError(404, "Listing not found");
        return clone(listingOut(listing));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/marketplace\/listings\/$/,
      resolve: ([, slug]) => {
        const ws = workspaces.find((w) => w.slug === slug);
        if (!ws) throw new APIError(404, "Workspace not found");
        return clone(marketplaceListings.filter((l) => l.workspace_id === ws.id).map(listingOut));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/marketplace\/listings\/$/,
      resolve: ([, slug], body) => {
        const ws = workspaces.find((w) => w.slug === slug);
        if (!ws) throw new APIError(404, "Workspace not found");
        const payload = body as IPublishListingPayload;
        const user = getUser();
        const listing: IListing = {
          id: uid(),
          workspace_id: ws.id,
          story_id: payload.story_id ?? null,
          cycle_id: payload.cycle_id ?? null,
          project_id: null,
          title: payload.title,
          description: payload.description ?? "",
          status: EListingStatus.Open,
          posted_by_id: user?.id ?? "user_unknown",
          created_at: nowIso(),
          bid_count: 0,
        };
        marketplaceListings.push(listing);
        return clone(listingOut(listing));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/marketplace\/listings\/([^/]+)\/bids\/$/,
      resolve: ([, , listingId]) =>
        clone(marketplaceBids.filter((b) => b.listing_id === listingId)),
    },
    {
      method: "POST",
      pattern: /^\/marketplace\/listings\/([^/]+)\/bids\/$/,
      resolve: ([, listingId], body) => {
        const listing = marketplaceListings.find((l) => l.id === listingId);
        if (!listing || listing.status !== EListingStatus.Open) {
          throw new APIError(409, "Listing is not open");
        }
        const user = getUser();
        if (!user) throw new APIError(401, "Unauthorized");
        const payload = body as { amount_cents: number; message?: string; delivery_days?: number };
        const bid: IBid = {
          id: uid(),
          listing_id: listingId,
          bidder_id: user.id,
          bidder_name: user.display_name,
          amount_cents: payload.amount_cents,
          message: payload.message ?? "",
          delivery_days: payload.delivery_days ?? null,
          status: EBidStatus.Pending,
          created_at: nowIso(),
        };
        marketplaceBids.push(bid);
        return clone(bid);
      },
    },
    {
      method: "DELETE",
      pattern: /^\/marketplace\/listings\/([^/]+)\/bids\/([^/]+)\/$/,
      resolve: ([, listingId, bidId]) => {
        const bid = marketplaceBids.find((b) => b.id === bidId && b.listing_id === listingId);
        if (!bid) throw new APIError(404, "Bid not found");
        bid.status = EBidStatus.Withdrawn;
        return clone(bid);
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/marketplace\/listings\/([^/]+)\/bids\/([^/]+)\/accept\/$/,
      resolve: ([, slug, listingId, bidId]) => {
        const listing = marketplaceListings.find((l) => l.id === listingId);
        const bid = marketplaceBids.find((b) => b.id === bidId);
        if (!listing || !bid) throw new APIError(404, "Not found");
        const fee = feeCents(bid.amount_cents);
        const wallet = walletBySlug[slug] ?? { available_cents: 0, held_cents: 0, currency: "usd" };
        if (wallet.available_cents < bid.amount_cents + fee) {
          throw new APIError(402, "Insufficient wallet balance to hire");
        }
        wallet.available_cents -= bid.amount_cents + fee;
        wallet.held_cents += bid.amount_cents + fee;
        walletBySlug[slug] = wallet;
        bid.status = EBidStatus.Accepted;
        listing.status = EListingStatus.Awarded;
        for (const other of marketplaceBids) {
          if (other.listing_id === listingId && other.id !== bidId && other.status === EBidStatus.Pending) {
            other.status = EBidStatus.Declined;
          }
        }
        const ws = workspaces.find((w) => w.slug === slug)!;
        const contract: IContract = {
          id: uid(),
          listing_id: listingId,
          bid_id: bidId,
          freelancer_id: bid.bidder_id,
          workspace_id: ws.id,
          workspace_slug: slug,
          bid_cents: bid.amount_cents,
          fee_cents: fee,
          status: EContractStatus.InProgress,
          delivered_at: null,
          completed_at: null,
          created_at: nowIso(),
          listing_title: listing.title,
          project_id: null,
          story_id: listing.story_id,
          cycle_id: listing.cycle_id,
        };
        marketplaceContracts.push(contract);
        return clone(contractOut(contract));
      },
    },
    {
      method: "GET",
      pattern: /^\/workspaces\/([^/]+)\/marketplace\/contracts\/$/,
      resolve: ([, slug]) => {
        const ws = workspaces.find((w) => w.slug === slug);
        if (!ws) throw new APIError(404, "Workspace not found");
        return clone(
          marketplaceContracts.filter((c) => c.workspace_id === ws.id).map(contractOut),
        );
      },
    },
    {
      method: "GET",
      pattern: /^\/marketplace\/contracts\/$/,
      resolve: (_m, _b, query) => {
        const user = getUser();
        const role = query.get("role") ?? "freelancer";
        if (role === "owner") {
          return clone(
            marketplaceContracts
              .filter((c) => {
                const ws = workspaces.find((w) => w.id === c.workspace_id);
                return ws?.slug === "acme" && user?.email === "ada@example.test";
              })
              .map(contractOut),
          );
        }
        return clone(
          marketplaceContracts.filter((c) => c.freelancer_id === user?.id).map(contractOut),
        );
      },
    },
    {
      method: "GET",
      pattern: /^\/marketplace\/contracts\/([^/]+)\/$/,
      resolve: ([, contractId]) => {
        const contract = marketplaceContracts.find((c) => c.id === contractId);
        if (!contract) throw new APIError(404, "Contract not found");
        assertContractReader(contract, getUser());
        return clone(contractOut(contract));
      },
    },
    {
      method: "GET",
      pattern: /^\/marketplace\/contracts\/([^/]+)\/stories\/$/,
      resolve: ([, contractId]) => {
        const contract = marketplaceContracts.find((c) => c.id === contractId);
        if (!contract) throw new APIError(404, "Contract not found");
        assertContractReader(contract, getUser());
        return clone(scopedStories(contract));
      },
    },
    {
      method: "GET",
      pattern: /^\/marketplace\/contracts\/([^/]+)\/documents\/$/,
      resolve: ([, contractId]) => {
        const contract = marketplaceContracts.find((c) => c.id === contractId);
        if (!contract) throw new APIError(404, "Contract not found");
        assertContractReader(contract, getUser());
        return clone(scopedDocuments(contract));
      },
    },
    {
      method: "POST",
      pattern: /^\/marketplace\/contracts\/([^/]+)\/deliver\/$/,
      resolve: ([, contractId]) => {
        const contract = marketplaceContracts.find((c) => c.id === contractId);
        if (!contract) throw new APIError(404, "Contract not found");
        const user = getUser();
        if (user?.id !== contract.freelancer_id) throw new APIError(403, "Not allowed");
        contract.status = EContractStatus.Delivered;
        contract.delivered_at = nowIso();
        return clone(contractOut(contract));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/marketplace\/contracts\/([^/]+)\/approve\/$/,
      resolve: ([, slug, contractId]) => {
        const contract = marketplaceContracts.find((c) => c.id === contractId);
        if (!contract) throw new APIError(404, "Contract not found");
        if (contract.status !== EContractStatus.Delivered) {
          throw new APIError(409, "Contract is not delivered");
        }
        const wallet = walletBySlug[slug] ?? { available_cents: 0, held_cents: 0, currency: "usd" };
        wallet.held_cents -= contract.bid_cents + contract.fee_cents;
        walletBySlug[slug] = wallet;
        contract.status = EContractStatus.Completed;
        contract.completed_at = nowIso();
        const listing = marketplaceListings.find((l) => l.id === contract.listing_id);
        if (listing) listing.status = EListingStatus.Closed;
        return clone(contractOut(contract));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/marketplace\/contracts\/([^/]+)\/request-changes\/$/,
      resolve: ([, , contractId]) => {
        const contract = marketplaceContracts.find((c) => c.id === contractId);
        if (!contract) throw new APIError(404, "Contract not found");
        contract.status = EContractStatus.InProgress;
        contract.delivered_at = null;
        return clone(contractOut(contract));
      },
    },
    {
      method: "POST",
      pattern: /^\/workspaces\/([^/]+)\/marketplace\/contracts\/([^/]+)\/cancel\/$/,
      resolve: ([, slug, contractId]) => {
        const contract = marketplaceContracts.find((c) => c.id === contractId);
        if (!contract) throw new APIError(404, "Contract not found");
        const wallet = walletBySlug[slug] ?? { available_cents: 0, held_cents: 0, currency: "usd" };
        wallet.held_cents -= contract.bid_cents + contract.fee_cents;
        wallet.available_cents += contract.bid_cents + contract.fee_cents;
        walletBySlug[slug] = wallet;
        contract.status = EContractStatus.Cancelled;
        const listing = marketplaceListings.find((l) => l.id === contract.listing_id);
        if (listing) listing.status = EListingStatus.Closed;
        return clone(contractOut(contract));
      },
    },
  ];
}
