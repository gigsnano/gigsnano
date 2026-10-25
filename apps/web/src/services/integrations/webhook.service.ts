import type {
  ICreateWebhookPayload,
  IUpdateWebhookPayload,
  IWebhook,
  IWebhookDelivery,
} from "@/types";

import { APIService } from "../api.service";

class WebhookService extends APIService {
  getWebhooks(workspaceSlug: string) {
    return this.get<IWebhook[]>(`/workspaces/${workspaceSlug}/webhooks/`);
  }

  getWebhook(workspaceSlug: string, webhookId: string) {
    return this.get<IWebhook>(`/workspaces/${workspaceSlug}/webhooks/${webhookId}/`);
  }

  createWebhook(workspaceSlug: string, payload: ICreateWebhookPayload) {
    return this.post<IWebhook>(`/workspaces/${workspaceSlug}/webhooks/`, payload);
  }

  updateWebhook(workspaceSlug: string, webhookId: string, payload: IUpdateWebhookPayload) {
    return this.patch<IWebhook>(`/workspaces/${workspaceSlug}/webhooks/${webhookId}/`, payload);
  }

  deleteWebhook(workspaceSlug: string, webhookId: string) {
    return this.delete<void>(`/workspaces/${workspaceSlug}/webhooks/${webhookId}/`);
  }

  testWebhook(workspaceSlug: string, webhookId: string) {
    return this.post<IWebhookDelivery>(
      `/workspaces/${workspaceSlug}/webhooks/${webhookId}/test/`,
      {},
    );
  }
}

export const webhookService = new WebhookService();
