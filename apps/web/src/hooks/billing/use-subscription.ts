import { useMutation, useQuery } from "@tanstack/react-query";

import type { EBillingInterval, EPlanTier } from "@/constants/plans";
import { subscriptionService } from "@/services/billing/subscription.service";

import { queryKeys } from "../query-keys";

/** The workspace's current subscription (real API; Free by default until upgraded). */
export function useSubscription(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.subscription(workspaceSlug),
    queryFn: () => subscriptionService.getSubscription(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

/** Start Checkout for a tier/interval; on success the caller redirects to `checkout_url`. */
export function useCreateCheckout(workspaceSlug: string) {
  return useMutation({
    mutationFn: (vars: { tier: EPlanTier; interval: EBillingInterval }) =>
      subscriptionService.createCheckout(workspaceSlug, vars.tier, vars.interval),
  });
}

/** Open the billing portal; on success the caller redirects to `checkout_url`. */
export function useCreatePortal(workspaceSlug: string) {
  return useMutation({
    mutationFn: () => subscriptionService.createPortal(workspaceSlug),
  });
}
