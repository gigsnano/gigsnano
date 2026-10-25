import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/hooks/query-keys";
import { estimateCost } from "@/lib/ai-cost/estimate";
import { aiUsageService } from "@/services/billing/ai-usage.service";
import type { EAiOperation, ICostEstimate } from "@/types/billing/ai-cost";

export function useWorkspaceUsage(slug: string) {
  return useQuery({
    queryKey: queryKeys.aiWorkspaceUsage(slug),
    queryFn: () => aiUsageService.getWorkspaceUsage(slug),
  });
}

export function useThreadUsage(
  slug: string,
  projectId: string,
  storyId: string,
  threadId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.aiThreadUsage(slug, projectId, storyId, threadId),
    queryFn: () => aiUsageService.getThreadUsage(slug, projectId, storyId, threadId),
    enabled: enabled && Boolean(threadId),
  });
}

/** Synchronous client-side estimate (no network today; endpoint reserved for cutover). */
export function useCostEstimate(operation: EAiOperation): ICostEstimate {
  return estimateCost(operation);
}
