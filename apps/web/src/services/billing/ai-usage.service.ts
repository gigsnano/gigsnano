import { APIService } from "@/services/api.service";
import type { IThreadUsage, IWorkspaceUsageSummary } from "@/types/billing/ai-cost";

class AiUsageService extends APIService {
  getWorkspaceUsage(slug: string) {
    return this.get<IWorkspaceUsageSummary>(`/workspaces/${slug}/ai-usage/`);
  }
  getThreadUsage(slug: string, projectId: string, storyId: string, threadId: string) {
    return this.get<IThreadUsage>(
      `/workspaces/${slug}/projects/${projectId}/stories/${storyId}/thread/${threadId}/usage/`,
    );
  }
}
export const aiUsageService = new AiUsageService();
