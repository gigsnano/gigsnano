import { useQuery } from "@tanstack/react-query";

import { marketplaceService } from "@/services/marketplace/marketplace.service";

import { queryKeys } from "../query-keys";

/** All marketplace jobs (client-side filtering happens above this hook). */
export function useMarketplaceJobs() {
  return useQuery({
    queryKey: queryKeys.marketplaceJobs,
    queryFn: () => marketplaceService.getJobs(),
  });
}

/** A single job listing. */
export function useMarketplaceJob(jobId: string) {
  return useQuery({
    queryKey: queryKeys.marketplaceJob(jobId),
    queryFn: () => marketplaceService.getJob(jobId),
    enabled: Boolean(jobId),
  });
}

/** All marketplace freelancers. */
export function useFreelancers() {
  return useQuery({
    queryKey: queryKeys.marketplaceFreelancers,
    queryFn: () => marketplaceService.getFreelancers(),
  });
}

/** A single freelancer profile. */
export function useFreelancer(freelancerId: string) {
  return useQuery({
    queryKey: queryKeys.marketplaceFreelancer(freelancerId),
    queryFn: () => marketplaceService.getFreelancer(freelancerId),
    enabled: Boolean(freelancerId),
  });
}
