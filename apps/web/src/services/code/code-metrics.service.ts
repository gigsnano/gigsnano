import type { ICodeMetrics } from "@/types";

import { APIService } from "../api.service";

class CodeMetricsService extends APIService {
  /** The project's static code metrics (`metrics.json`). 409s when the index
   * isn't ready. */
  getMetrics(workspaceSlug: string, projectId: string) {
    return this.get<ICodeMetrics>(
      `/workspaces/${workspaceSlug}/projects/${projectId}/code/metrics/`,
    );
  }
}

export const codeMetricsService = new CodeMetricsService();
