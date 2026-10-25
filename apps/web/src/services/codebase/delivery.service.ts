import type { IDeliveryBundle, IUpdateDeliveryRepoPayload } from "@/types";

import { APIService } from "../api.service";

class DeliveryService extends APIService {
  private base(slug: string, projectId: string, storyId: string) {
    return `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/delivery`;
  }

  getDelivery(slug: string, projectId: string, storyId: string) {
    return this.get<IDeliveryBundle>(`${this.base(slug, projectId, storyId)}/`);
  }

  /** Create from the confirmed Code scope (409 if not confirmed; idempotent). */
  createDelivery(slug: string, projectId: string, storyId: string) {
    return this.post<IDeliveryBundle>(`${this.base(slug, projectId, storyId)}/`);
  }

  updateRepo(
    slug: string,
    projectId: string,
    storyId: string,
    repoId: string,
    payload: IUpdateDeliveryRepoPayload,
  ) {
    return this.patch<IDeliveryBundle>(
      `${this.base(slug, projectId, storyId)}/repositories/${repoId}/`,
      payload,
    );
  }

  cancelDelivery(slug: string, projectId: string, storyId: string) {
    return this.post<IDeliveryBundle>(`${this.base(slug, projectId, storyId)}/cancel/`);
  }
}

export const deliveryService = new DeliveryService();
