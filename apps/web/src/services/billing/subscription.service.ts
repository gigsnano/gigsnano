import type { EBillingInterval, EPlanTier } from "@/constants/plans";
import type { ISubscription } from "@/types";

import { APIService } from "../api.service";

class SubscriptionService extends APIService {
  getSubscription(workspaceSlug: string) {
    return this.get<ISubscription>(`/workspaces/${workspaceSlug}/billing/subscription/`);
  }

  /** Start a subscription Checkout for a tier/interval. Returns the URL to redirect to. */
  createCheckout(workspaceSlug: string, tier: EPlanTier, interval: EBillingInterval) {
    return this.post<{ checkout_url: string }>(
      `/workspaces/${workspaceSlug}/billing/checkout/`,
      { tier, interval },
    );
  }

  /** Open the Stripe billing portal for the current subscription. Returns the URL. */
  createPortal(workspaceSlug: string) {
    return this.post<{ checkout_url: string }>(
      `/workspaces/${workspaceSlug}/billing/portal/`,
      {},
    );
  }
}

export const subscriptionService = new SubscriptionService();
