import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/hooks/query-keys";
import { marketplaceFlowService } from "@/services/marketplace/marketplace-flow.service";
import type { ICreateBidPayload, IPublishListingPayload } from "@/types/marketplace/listing";

export function usePublicListings() {
  return useQuery({
    queryKey: queryKeys.marketplaceListings,
    queryFn: () => marketplaceFlowService.listPublicListings(),
  });
}

export function useListing(listingId: string) {
  return useQuery({
    queryKey: queryKeys.marketplaceListing(listingId),
    queryFn: () => marketplaceFlowService.getListing(listingId),
    enabled: Boolean(listingId),
  });
}

export function useWorkspaceListings(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.workspaceListings(workspaceSlug),
    queryFn: () => marketplaceFlowService.listWorkspaceListings(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

export function useListingBids(workspaceSlug: string, listingId: string) {
  return useQuery({
    queryKey: queryKeys.listingBids(workspaceSlug, listingId),
    queryFn: () => marketplaceFlowService.listBids(workspaceSlug, listingId),
    enabled: Boolean(workspaceSlug && listingId),
  });
}

export function useWorkspaceContracts(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.workspaceContracts(workspaceSlug),
    queryFn: () => marketplaceFlowService.listWorkspaceContracts(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

export function useMyContracts(role: "freelancer" | "owner" = "freelancer") {
  return useQuery({
    queryKey: queryKeys.myContracts(role),
    queryFn: () => marketplaceFlowService.listMyContracts(role),
  });
}

export function usePublishListing(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: IPublishListingPayload) =>
      marketplaceFlowService.publishListing(workspaceSlug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workspaceListings(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceListings });
    },
  });
}

export function useCreateBid(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ICreateBidPayload) =>
      marketplaceFlowService.createBid(listingId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceListing(listingId) });
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceListings });
    },
  });
}

export function useAcceptBid(workspaceSlug: string, listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) =>
      marketplaceFlowService.acceptBid(workspaceSlug, listingId, bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.listingBids(workspaceSlug, listingId) });
      qc.invalidateQueries({ queryKey: queryKeys.workspaceListings(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.workspaceContracts(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.wallet(workspaceSlug) });
    },
  });
}

export function useWithdrawBid(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => marketplaceFlowService.withdrawBid(listingId, bidId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceListing(listingId) });
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceListings });
    },
  });
}

export function useContract(contractId: string) {
  return useQuery({
    queryKey: queryKeys.marketplaceContract(contractId),
    queryFn: () => marketplaceFlowService.getContract(contractId),
    enabled: Boolean(contractId),
  });
}

export function useContractStories(contractId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.contractStories(contractId),
    queryFn: () => marketplaceFlowService.listContractStories(contractId),
    enabled: Boolean(contractId) && enabled,
  });
}

export function useContractDocuments(contractId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.contractDocuments(contractId),
    queryFn: () => marketplaceFlowService.listContractDocuments(contractId),
    enabled: Boolean(contractId) && enabled,
  });
}

export function useDeliverContract(contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => marketplaceFlowService.deliverContract(contractId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceContract(contractId) });
      qc.invalidateQueries({ queryKey: queryKeys.myContracts("freelancer") });
    },
  });
}
export function useApproveContract(workspaceSlug: string, contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => marketplaceFlowService.approveContract(workspaceSlug, contractId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workspaceContracts(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.workspaceListings(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceContract(contractId) });
      qc.invalidateQueries({ queryKey: queryKeys.wallet(workspaceSlug) });
    },
  });
}

export function useRequestChanges(workspaceSlug: string, contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => marketplaceFlowService.requestChanges(workspaceSlug, contractId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workspaceContracts(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceContract(contractId) });
      qc.invalidateQueries({ queryKey: queryKeys.myContracts("freelancer") });
    },
  });
}

export function useCancelContract(workspaceSlug: string, contractId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => marketplaceFlowService.cancelContract(workspaceSlug, contractId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workspaceContracts(workspaceSlug) });
      qc.invalidateQueries({ queryKey: queryKeys.marketplaceContract(contractId) });
      qc.invalidateQueries({ queryKey: queryKeys.wallet(workspaceSlug) });
    },
  });
}
