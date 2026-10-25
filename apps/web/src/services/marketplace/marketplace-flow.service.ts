import type {
  IBid,
  IContract,
  ICreateBidPayload,
  IListing,
  IPublishListingPayload,
} from "@/types/marketplace/listing";
import type { IDocument, IStory } from "@/types";

import { APIService } from "../api.service";

class MarketplaceFlowService extends APIService {
  listPublicListings() {
    return this.get<IListing[]>("/marketplace/listings/");
  }

  getListing(listingId: string) {
    return this.get<IListing>(`/marketplace/listings/${listingId}/`);
  }

  listWorkspaceListings(workspaceSlug: string) {
    return this.get<IListing[]>(`/workspaces/${workspaceSlug}/marketplace/listings/`);
  }

  publishListing(workspaceSlug: string, payload: IPublishListingPayload) {
    return this.post<IListing>(`/workspaces/${workspaceSlug}/marketplace/listings/`, payload);
  }

  listBids(workspaceSlug: string, listingId: string) {
    return this.get<IBid[]>(
      `/workspaces/${workspaceSlug}/marketplace/listings/${listingId}/bids/`,
    );
  }

  createBid(listingId: string, payload: ICreateBidPayload) {
    return this.post<IBid>(`/marketplace/listings/${listingId}/bids/`, payload);
  }

  withdrawBid(listingId: string, bidId: string) {
    return this.delete<IBid>(`/marketplace/listings/${listingId}/bids/${bidId}/`);
  }

  acceptBid(workspaceSlug: string, listingId: string, bidId: string) {
    return this.post<IContract>(
      `/workspaces/${workspaceSlug}/marketplace/listings/${listingId}/bids/${bidId}/accept/`,
    );
  }

  listWorkspaceContracts(workspaceSlug: string) {
    return this.get<IContract[]>(`/workspaces/${workspaceSlug}/marketplace/contracts/`);
  }

  listMyContracts(role: "freelancer" | "owner" = "freelancer") {
    return this.get<IContract[]>(`/marketplace/contracts/?role=${role}`);
  }

  getContract(contractId: string) {
    return this.get<IContract>(`/marketplace/contracts/${contractId}/`);
  }

  listContractStories(contractId: string) {
    return this.get<IStory[]>(`/marketplace/contracts/${contractId}/stories/`);
  }

  listContractDocuments(contractId: string) {
    return this.get<IDocument[]>(`/marketplace/contracts/${contractId}/documents/`);
  }

  deliverContract(contractId: string) {
    return this.post<IContract>(`/marketplace/contracts/${contractId}/deliver/`);
  }

  approveContract(workspaceSlug: string, contractId: string) {
    return this.post<IContract>(
      `/workspaces/${workspaceSlug}/marketplace/contracts/${contractId}/approve/`,
    );
  }

  requestChanges(workspaceSlug: string, contractId: string) {
    return this.post<IContract>(
      `/workspaces/${workspaceSlug}/marketplace/contracts/${contractId}/request-changes/`,
    );
  }

  cancelContract(workspaceSlug: string, contractId: string) {
    return this.post<IContract>(
      `/workspaces/${workspaceSlug}/marketplace/contracts/${contractId}/cancel/`,
    );
  }
}

export const marketplaceFlowService = new MarketplaceFlowService();
