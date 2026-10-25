import type { IJourney } from "@/types/journey/journey";
import type { IDeliveryPlan } from "@/lib/journey/delivery-plan";
import type { IExperienceContract } from "@/lib/journey/experience";
import type { ITopology } from "@/lib/journey/topology";
import type { IDiscovery } from "@/lib/journey/discovery";

import { APIService } from "../api.service";

/** {discovery, saved} — fresh projection (saved:false) or the approved baseline (saved:true). */
export type DiscoveryEnvelope = { discovery: IDiscovery; saved: boolean };

/** {contract} envelope returned by the journey contract endpoints (null when unsaved). */
type ContractEnvelope<T> = { contract: T | null };

/** Project Journey (GIN-434 Phase 0). Read-only; live on gigsnano-api. */
class JourneyService extends APIService {
  getJourney(workspaceSlug: string, projectId: string) {
    return this.get<IJourney>(`/workspaces/${workspaceSlug}/projects/${projectId}/journey/`);
  }

  /** Delivery plan (GIN-429) — projection of the real Epic→Story→Task tree. */
  getDeliveryPlan(workspaceSlug: string, projectId: string) {
    return this.get<IDeliveryPlan>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/journey/delivery/`,
    );
  }
  /** Start delivery (GIN-429) — create/confirm the first cycle from the plan. */
  startDelivery(workspaceSlug: string, projectId: string, title: string, storyIds: string[]) {
    return this.post<{ cycle_id: string; created: boolean }>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/journey/delivery/start/`,
      { title, story_ids: storyIds },
    );
  }

  /** Experience Contract (GIN-431) — persisted as the ux step's artifact JSON. */
  getExperienceContract(workspaceSlug: string, projectId: string) {
    return this.get<ContractEnvelope<IExperienceContract>>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/journey/experience/`,
    );
  }
  saveExperienceContract(workspaceSlug: string, projectId: string, contract: IExperienceContract) {
    return this.put<ContractEnvelope<IExperienceContract>>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/journey/experience/`,
      contract,
    );
  }

  /** Solution Topology (GIN-430) — persisted as the architecture step's artifact JSON. */
  getTopology(workspaceSlug: string, projectId: string) {
    return this.get<ContractEnvelope<ITopology>>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/journey/topology/`,
    );
  }
  saveTopology(workspaceSlug: string, projectId: string, topology: ITopology) {
    return this.put<ContractEnvelope<ITopology>>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/journey/topology/`,
      topology,
    );
  }

  /** Existing-project discovery (GIN-432) — projected from real repos/docs/backlog. */
  getDiscovery(workspaceSlug: string, projectId: string) {
    return this.get<DiscoveryEnvelope>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/journey/discovery/`,
    );
  }
  saveDiscovery(workspaceSlug: string, projectId: string, discovery: IDiscovery) {
    return this.put<DiscoveryEnvelope>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/journey/discovery/`,
      discovery,
    );
  }
}

export const journeyService = new JourneyService();
