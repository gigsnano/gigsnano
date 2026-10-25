import type { IDeliveryMetrics, IForecast, IHealth } from "@/types";

import { APIService } from "../api.service";

/** Read-only forecasting API (GIN-333/334/335/336). */
class ForecastingService extends APIService {
  getDeliveryMetrics(workspaceSlug: string, projectId: string) {
    return this.get<IDeliveryMetrics>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/forecasting/delivery-metrics/`,
    );
  }

  getForecast(workspaceSlug: string, projectId: string) {
    return this.get<IForecast>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/forecasting/completion/`,
    );
  }

  getHealth(workspaceSlug: string, projectId: string) {
    return this.get<IHealth>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/forecasting/health/`,
    );
  }
}

export const forecastingService = new ForecastingService();
