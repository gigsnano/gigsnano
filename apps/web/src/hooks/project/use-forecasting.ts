import { useQuery } from "@tanstack/react-query";

import { forecastingService } from "@/services/project/forecasting.service";

import { queryKeys } from "../query-keys";

/** Monte Carlo completion forecast (P50/P85/P95 + confidence) for a project. */
export function useForecast(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.forecast(workspaceSlug, projectId),
    queryFn: () => forecastingService.getForecast(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

/** Throughput / cycle-time / scope aggregates for a project. */
export function useDeliveryMetrics(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.deliveryMetrics(workspaceSlug, projectId),
    queryFn: () => forecastingService.getDeliveryMetrics(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}

/** Explainable system health (status + evidence) for a project. */
export function useProjectHealth(workspaceSlug: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectHealth(workspaceSlug, projectId),
    queryFn: () => forecastingService.getHealth(workspaceSlug, projectId),
    enabled: Boolean(projectId),
  });
}
