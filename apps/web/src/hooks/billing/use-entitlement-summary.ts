import { useQuery } from "@tanstack/react-query";

import { entitlementService } from "@/services/billing/entitlement.service";
import type { IEntitlement } from "@/types";

import { queryKeys } from "../query-keys";

/** The workspace's per-capability plan state (server-driven, GIN-236). */
export function useEntitlementSummary(workspaceSlug: string) {
  return useQuery({
    queryKey: queryKeys.entitlements(workspaceSlug),
    queryFn: () => entitlementService.getEntitlements(workspaceSlug),
    enabled: Boolean(workspaceSlug),
  });
}

/**
 * A single capability's state. While loading, `available` is optimistically true
 * so a gated feature never flickers locked before the plan resolves (the server
 * still enforces the 402). `entitlement` is undefined until loaded.
 */
export function useEntitlement(workspaceSlug: string, key: string) {
  const { data, isLoading } = useEntitlementSummary(workspaceSlug);
  const entitlement: IEntitlement | undefined = data?.find((e) => e.key === key);
  return {
    entitlement,
    isLoading,
    available: entitlement?.available ?? true,
  };
}
