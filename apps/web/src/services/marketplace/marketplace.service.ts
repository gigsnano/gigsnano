import type { IFreelancer, IMarketplaceJob } from "@/types";

import { APIService } from "../api.service";

class MarketplaceService extends APIService {
  getJobs() {
    return this.get<IMarketplaceJob[]>("/marketplace/jobs/");
  }

  getJob(jobId: string) {
    return this.get<IMarketplaceJob>(`/marketplace/jobs/${jobId}/`);
  }

  getFreelancers() {
    return this.get<IFreelancer[]>("/marketplace/talent/");
  }

  getFreelancer(freelancerId: string) {
    return this.get<IFreelancer>(`/marketplace/talent/${freelancerId}/`);
  }
}

export const marketplaceService = new MarketplaceService();
